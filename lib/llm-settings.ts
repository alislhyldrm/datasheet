"use client";

// BYOK settings, kept in localStorage (per browser). The key is sent to this
// app's own API routes per request and is never stored server-side — the app is
// meant to run on the user's own machine, so the key never leaves it except to
// go to the provider the user chose.

import { useCallback, useSyncExternalStore } from "react";
import type { ProviderId } from "./llm/types";
import { PROVIDER_META, isProviderId } from "./llm/providers-meta";

export interface LlmSettings {
  provider: ProviderId;
  model: string;
  apiKey: string;
}

// The stored value plus whether it exists at all. Until the panel is saved
// once, this browser has no opinion and the server's env config decides; after
// that, the saved provider + model are the default for every later session,
// key or no key.
export interface StoredSettings extends LlmSettings {
  chosen: boolean;
}

const STORAGE_KEY = "datasheet.llm";
const EVENT = "datasheet:llm-change";

export const DEFAULT_SETTINGS: StoredSettings = {
  provider: "anthropic",
  model: "",
  apiKey: "",
  chosen: false,
};

function parse(raw: string | null): StoredSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const p = JSON.parse(raw) as Partial<LlmSettings>;
    return {
      provider: isProviderId(p.provider) ? p.provider : "anthropic",
      model: typeof p.model === "string" ? p.model : "",
      apiKey: typeof p.apiKey === "string" ? p.apiKey : "",
      chosen: true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function loadSettings(): StoredSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  return parse(window.localStorage.getItem(STORAGE_KEY));
}

export function saveSettings(s: LlmSettings) {
  const { provider, model, apiKey } = s;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ provider, model, apiKey }),
    );
  } catch {
    // Private mode / storage disabled: settings just won't survive a reload.
  }
  window.dispatchEvent(new Event(EVENT));
}

// The model actually sent: the user's entry, or the provider default.
export function effectiveModel(s: LlmSettings): string {
  return s.model.trim() || PROVIDER_META[s.provider].defaultModel;
}

export interface RequestCredentials {
  provider?: ProviderId;
  model?: string;
  apiKey?: string;
}

// What a request carries: the provider and model this browser runs on, plus
// its own key when it has one. With no key the server uses its env key for that
// same provider — which is why picking a model in the panel works even when the
// key lives in .env.local.
export function requestCredentials(s: LlmSettings): RequestCredentials {
  const key = s.apiKey.trim();
  return {
    provider: s.provider,
    model: effectiveModel(s),
    ...(key ? { apiKey: key } : {}),
  };
}

// useSyncExternalStore needs a stable snapshot reference between changes.
let cachedRaw: string | null = null;
let cachedValue: StoredSettings = DEFAULT_SETTINGS;

function getSnapshot(): StoredSettings {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parse(raw);
  }
  return cachedValue;
}

function getServerSnapshot(): StoredSettings {
  return DEFAULT_SETTINGS;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export interface LlmSettingsStore {
  settings: StoredSettings;
  save: (next: LlmSettings) => void;
}

export function useLlmSettings(): LlmSettingsStore {
  const settings = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const save = useCallback((next: LlmSettings) => saveSettings(next), []);
  return { settings, save };
}
