// Turns a thrown provider error into a short Turkish message for the client.
// Details stay server-side; the client only ever sees these strings.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ProviderId } from "./types";

const LABEL: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
};

function statusOf(err: unknown): number | undefined {
  if (err instanceof Anthropic.APIError && typeof err.status === "number") {
    return err.status;
  }
  if (err instanceof OpenAI.APIError && typeof err.status === "number") {
    return err.status;
  }
  // @google/genai throws ApiError with a numeric `status`.
  if (
    err &&
    typeof err === "object" &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  ) {
    return (err as { status: number }).status;
  }
  return undefined;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? "");
}

// Gemini reports a bad key as 400 API_KEY_INVALID rather than 401, so the
// status alone would send the user off to check their model id instead.
function looksLikeBadKey(err: unknown): boolean {
  return /API_KEY_INVALID|api key not valid|invalid[_ ]api[_ ]key|unauthenticated/i.test(
    messageOf(err),
  );
}

// Gemini 404s a retired or misspelled model id the same way it 404s a missing
// file; the message is the only tell.
function looksLikeBadModel(err: unknown): boolean {
  return /\bmodel\b[^]*?(not found|no longer available|not supported|does not exist)/i.test(
    messageOf(err),
  );
}

export function mapProviderError(provider: ProviderId, err: unknown): string {
  const who = LABEL[provider];
  const status = statusOf(err);

  if (
    err instanceof Anthropic.RateLimitError ||
    err instanceof OpenAI.RateLimitError ||
    status === 429
  ) {
    return "Hız sınırı aşıldı, birkaç saniye sonra tekrar deneyin.";
  }
  if (status === 401 || status === 403 || looksLikeBadKey(err)) {
    return `API anahtarı reddedildi (${who}). Ayarlardan anahtarı kontrol edin.`;
  }
  if (looksLikeBadModel(err)) {
    return `Model kimliği ${who} tarafından tanınmadı. Ayarlardan geçerli bir model yaz.`;
  }
  if (status === 404) {
    return "Datasheet dosyası bulunamadı veya süresi doldu. PDF'i tekrar yükleyin.";
  }
  if (status === 400 || status === 422) {
    return `İstek ${who} tarafından reddedildi. Model kimliğini ve PDF'i kontrol edin.`;
  }
  if (typeof status === "number" && status >= 500) {
    return `Sunucu meşgul (${who}). Tekrar deneyin.`;
  }
  return "Bir hata oluştu";
}
