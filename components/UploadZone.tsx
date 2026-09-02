"use client";

import { useRef, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { uploadPdf, validatePdf, type UploadPhase } from "@/lib/upload-client";
import type { LlmSettings } from "@/lib/llm-settings";
import type { UploadedDoc } from "@/lib/types";

export default function UploadZone({
  onUploaded,
  label,
  compact,
  settings,
}: {
  onUploaded: (doc: UploadedDoc) => void;
  label: string;
  compact?: boolean;
  settings: LlmSettings;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const lastFile = useRef<File | null>(null);
  const [phase, setPhase] = useState<UploadPhase | null>(null);
  const [fraction, setFraction] = useState(0);
  // A rejected file can only be replaced; a failed upload can be retried.
  const [error, setError] = useState<{
    message: string;
    kind: "rejected" | "failed";
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const busy = phase !== null;

  async function handleFile(file: File) {
    lastFile.current = file;
    setError(null);

    const invalid = validatePdf(file);
    if (invalid) {
      setError({ message: invalid, kind: "rejected" });
      return;
    }

    setPhase("uploading");
    setFraction(0);
    try {
      const doc = await uploadPdf(file, settings, (nextPhase, nextFraction) => {
        setPhase(nextPhase);
        setFraction(nextFraction);
      });
      // The viewer reads the local File rather than fetching the PDF back.
      onUploaded({ ...doc, objectUrl: URL.createObjectURL(file) });
    } catch (e) {
      setError({
        message: e instanceof Error ? e.message : "Yükleme başarısız",
        kind: "failed",
      });
    } finally {
      setPhase(null);
      setFraction(0);
    }
  }

  return (
    <div className={compact ? "" : "flex h-full w-full flex-col"}>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={`press relative flex w-full items-center justify-center gap-2 overflow-hidden border-dashed px-4 text-center transition-all duration-200 ease-fluid ${
          compact
            ? "card min-h-11 rounded-control py-3 text-meta"
            : "card-lg h-full flex-col justify-center rounded-card py-20 text-body"
        } ${
          dragOver
            ? "border-accent bg-accent-soft"
            : "border-hairline-strong hover:border-accent-ring"
        } ${busy ? "cursor-wait" : "cursor-pointer"}`}
      >
        {busy ? (
          <span className="flex items-center gap-2 text-ink">
            {phase === "uploading" ? "Yükleniyor" : "İşleniyor"}
            <span className="font-mono text-micro text-ink-muted">
              {Math.round(fraction * 100)}%
            </span>
          </span>
        ) : compact ? (
          <span className="flex items-center gap-1.5 text-ink">
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </span>
        ) : (
          <>
            <span
              aria-hidden="true"
              className="well mb-4 flex size-16 items-center justify-center rounded-full text-accent"
            >
              <Upload size={26} strokeWidth={1.75} />
            </span>
            <span className="text-display font-semibold tracking-tight text-ink">
              {label}
            </span>
            <span className="mt-1.5 text-body text-ink-muted">
              Sürükle bırak veya seç.
            </span>
          </>
        )}

        {busy && (
          <span
            role="progressbar"
            aria-valuenow={Math.round(fraction * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={phase === "uploading" ? "Yükleniyor" : "İşleniyor"}
            className="absolute inset-x-0 bottom-0 h-1 origin-left bg-linear-to-r from-lime to-mint transition-transform duration-200 ease-fluid"
            style={{ transform: `scaleX(${fraction})` }}
          />
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {error && (
        <p
          role="alert"
          className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-danger"
        >
          <span>{error.message}</span>
          <button
            type="button"
            onClick={() => {
              const file = lastFile.current;
              if (error.kind === "failed" && file) handleFile(file);
              else inputRef.current?.click();
            }}
            className="inline-flex min-h-11 items-center underline underline-offset-2 hover:no-underline"
          >
            {error.kind === "failed" ? "Tekrar dene" : "Başka dosya seç"}
          </button>
        </p>
      )}
    </div>
  );
}
