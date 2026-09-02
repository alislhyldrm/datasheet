"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ProviderId } from "@/lib/llm/types";
import { PROVIDER_META, PROVIDER_IDS } from "@/lib/llm/providers-meta";
import type { LlmSettings } from "@/lib/llm-settings";

export default function SettingsDialog({
  open,
  initial,
  onSave,
  onClose,
}: {
  open: boolean;
  initial: LlmSettings;
  onSave: (next: LlmSettings) => void;
  onClose: () => void;
}) {
  // Mount the body only while open, so its useState initializers re-seed from
  // `initial` on every open with no reset effect.
  if (!open) return null;
  return <Body initial={initial} onSave={onSave} onClose={onClose} />;
}

function Body({
  initial,
  onSave,
  onClose,
}: {
  initial: LlmSettings;
  onSave: (next: LlmSettings) => void;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState<ProviderId>(initial.provider);
  const [model, setModel] = useState(initial.model);
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [show, setShow] = useState(false);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const listId = useId();

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = PROVIDER_META[provider];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ provider, model: model.trim(), apiKey: apiKey.trim() });
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[10vh] backdrop-blur-sm"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Model ve API anahtarı ayarları"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="chrome-float w-full max-w-md rounded-card p-5 [background-color:rgb(255_255_255/0.94)] dark:[background-color:rgb(16_49_74/0.96)]"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-title font-semibold text-ink">
              Model ayarları
            </h2>
            <p className="mt-0.5 text-micro text-ink-muted">
              Buradaki seçim bu tarayıcıda saklanır ve bundan sonrasının
              varsayılanı olur. İstediğin zaman geri gelip değiştirebilirsin.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="press -mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-inner text-ink-muted hover:bg-card-2 hover:text-ink"
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <label className="mb-1 block text-meta font-medium text-ink">
          Sağlayıcı
        </label>
        <select
          ref={firstFieldRef}
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value as ProviderId);
            setModel("");
          }}
          className="well mb-3 w-full rounded-control px-3 py-2.5 text-body text-ink"
        >
          {PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {PROVIDER_META[id].label}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-meta font-medium text-ink">
          Model
        </label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={meta.defaultModel}
          list={listId}
          autoComplete="off"
          spellCheck={false}
          className="well mb-1 w-full rounded-control px-3 py-2.5 font-mono text-meta text-ink placeholder:text-ink-muted"
        />
        <datalist id={listId}>
          {meta.modelHints.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <p className="mb-3 text-micro text-ink-muted">
          Boş bırakılırsa <span className="font-mono">{meta.defaultModel}</span>
          . Anahtarının eriştiği herhangi bir model kimliğini yazabilirsin.
        </p>

        <label className="mb-1 block text-meta font-medium text-ink">
          API anahtarı{" "}
          <span className="font-normal text-ink-muted">({meta.envKey})</span>
        </label>
        <div className="mb-1 flex gap-2">
          <input
            type={show ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
            className="well w-full rounded-control px-3 py-2.5 font-mono text-meta text-ink placeholder:text-ink-muted"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="press shrink-0 rounded-control border border-hairline px-3 text-micro text-ink-muted hover:text-ink"
          >
            {show ? "gizle" : "göster"}
          </button>
        </div>
        <p className="mb-3 text-micro text-ink-muted">
          Anahtar bu tarayıcıda saklanır, yalnızca isteklerle bu uygulamanın
          sunucusuna gider.
        </p>

        <p className="mb-4 rounded-control bg-card-2 px-3 py-2 text-micro leading-relaxed text-ink-muted">
          {meta.nativeCitations
            ? "Bu sağlayıcı sayfa + birebir alıntıyı kendi API'siyle döndürür; alıntılar doğrulanmıştır."
            : "Bu sağlayıcıda sayfa ve alıntı modelden istenir, sonra PDF metnine karşı doğrulanır. Doğrulanamayan alıntı sayfa yerine yalnızca belge adıyla gösterilir."}
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="press min-h-11 rounded-control px-4 text-meta text-ink-muted hover:text-ink"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            className="btn-accent press min-h-11 rounded-control px-5 font-medium"
          >
            Kaydet
          </button>
        </div>
      </form>
    </div>
  );
}
