// Pure provider metadata — no SDK imports, safe to pull into client code
// (the settings panel) as well as the server registry.

import type { ProviderId } from "./types";

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  // Env var the server falls back to when the request carries no key.
  envKey: string;
  defaultModel: string;
  // Suggestions for the settings panel's model field (a datalist, not a closed
  // list — whatever the user's key can resolve is allowed).
  modelHints: string[];
  // Whether this provider returns structured, API-verified citations. false =
  // citations come from a prompt contract and are verified against page text.
  nativeCitations: boolean;
}

export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-5",
    modelHints: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"],
    nativeCitations: true,
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-5.1",
    modelHints: ["gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-4.1"],
    nativeCitations: false,
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    envKey: "GEMINI_API_KEY",
    // Rolling aliases: Google retires dated Gemini ids for new API keys fast
    // (the whole 2.x line is already gone), but "*-latest" keeps resolving.
    defaultModel: "gemini-pro-latest",
    modelHints: [
      "gemini-pro-latest",
      "gemini-flash-latest",
      "gemini-3.1-pro-preview",
    ],
    nativeCitations: false,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDER_META) as ProviderId[];

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && v in PROVIDER_META;
}
