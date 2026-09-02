// Maps a provider id to its adapter and resolves the per-request provider /
// model / key. Precedence: request body (BYOK from the UI) first, then env
// vars (<PROVIDER>_API_KEY, plus optional LLM_PROVIDER / LLM_MODEL) so a
// key in .env.local is enough on its own and the e2e test keeps working with
// no body fields.

import { anthropicAdapter } from "./anthropic";
import { openaiAdapter } from "./openai";
import { geminiAdapter } from "./gemini";
import { PROVIDER_META, PROVIDER_IDS, isProviderId } from "./providers-meta";
import type { ProviderAdapter, ProviderId } from "./types";
import { ProviderConfigError } from "./types";

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  gemini: geminiAdapter,
};

export { PROVIDER_META, PROVIDER_IDS, isProviderId } from "./providers-meta";

export function getAdapter(id: ProviderId): ProviderAdapter {
  return ADAPTERS[id];
}

export interface ResolvedProvider {
  adapter: ProviderAdapter;
  apiKey: string;
  model: string;
}

/** Providers whose key var is filled in the environment, in registry order. */
export function envProviders(): ProviderId[] {
  return PROVIDER_IDS.filter(
    (id) => (process.env[PROVIDER_META[id].envKey] ?? "").trim().length > 0,
  );
}

/**
 * The provider the server falls back to when a request carries none.
 * `LLM_PROVIDER` if set, otherwise inferred from the single key var that is
 * filled — naming the provider twice is redundant. Null when nothing is
 * configured, or when several keys are set and none of them is the stated one.
 */
export function envProvider(): ProviderId | null {
  if (isProviderId(process.env.LLM_PROVIDER)) return process.env.LLM_PROVIDER;
  const filled = envProviders();
  return filled.length === 1 ? filled[0] : null;
}

/**
 * What the client may know about the server's env config: which providers it
 * holds a key for, which one it defaults to, and the model that key was paired
 * with. Never the key itself. The provider list is what lets the settings panel
 * say "you can pick this one, the key is already here".
 */
export function envDefaults(): {
  providers: ProviderId[];
  provider: ProviderId | null;
  model: string;
} {
  const providers = envProviders();
  const provider = envProvider();
  return {
    providers,
    provider,
    model: envModel() || (provider ? PROVIDER_META[provider].defaultModel : ""),
  };
}

function envModel(): string {
  return (process.env.LLM_MODEL ?? "").trim();
}

export function resolveProvider(
  provider: unknown,
  model: unknown,
  apiKey: unknown,
): ResolvedProvider {
  const requested = isProviderId(provider) ? provider : null;
  const id = requested ?? envProvider();
  if (!id) {
    throw new ProviderConfigError(
      envProviders().length > 1
        ? "Ortamda birden fazla sağlayıcı anahtarı var. .env.local içinde LLM_PROVIDER ile hangisini kullanacağını yaz."
        : "API anahtarı yok. Ayarlardan bir anahtar girin ya da .env.local içinde ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY tanımlayın.",
    );
  }

  const adapter = ADAPTERS[id];
  const meta = PROVIDER_META[id];

  const key =
    (typeof apiKey === "string" && apiKey.trim()) ||
    process.env[meta.envKey] ||
    "";
  if (!key) {
    throw new ProviderConfigError(
      `${meta.label} için API anahtarı yok. Ayarlardan girin veya ${meta.envKey} tanımlayın.`,
    );
  }

  const chosenModel =
    (typeof model === "string" && model.trim()) ||
    // LLM_MODEL belongs to the env-configured provider, so it only applies
    // when the request didn't pick a provider of its own.
    (requested === null ? envModel() : "") ||
    meta.defaultModel;

  return { adapter, apiKey: key, model: chosenModel };
}
