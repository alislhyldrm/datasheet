import type { UploadedDoc } from "./types";
import { MAX_PDF_BYTES } from "./limits";
import { requestCredentials, type LlmSettings } from "./llm-settings";

/** The limit as a user-facing label, so no copy can quote a stale number. */
export const MAX_LABEL = `${MAX_PDF_BYTES / (1024 * 1024)} MB`;

export type UploadPhase = "uploading" | "processing";
export type ProgressHandler = (phase: UploadPhase, fraction: number) => void;

function formatMb(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validatePdf(file: File): string | null {
  const isPdf =
    file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf) {
    return "Bu bir PDF değil. Datasheet'in PDF sürümünü seç.";
  }
  if (file.size > MAX_PDF_BYTES) {
    return `PDF ${MAX_LABEL} sınırını aşıyor (${formatMb(file.size)}). Daha küçük bir dosya seç.`;
  }
  return null;
}

/**
 * POST the PDF to /api/upload, which forwards it to the configured provider's
 * Files API. One request, whatever the size — the app runs on a plain Node
 * server, so there is no serverless request-body cap to work around.
 *
 * fetch() cannot report upload progress; XMLHttpRequest still can.
 */
export function uploadPdf(
  file: File,
  settings: LlmSettings,
  onProgress?: ProgressHandler,
): Promise<UploadedDoc> {
  const invalid = validatePdf(file);
  if (invalid) return Promise.reject(new Error(invalid));

  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    // Omitted entirely when the browser has no key: the server then uses its
    // own env config rather than being told a provider it has no key for.
    for (const [field, value] of Object.entries(requestCredentials(settings))) {
      form.append(field, value);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const fraction = event.loaded / event.total;
      // Bytes are on the wire; the server's work hasn't started yet.
      onProgress?.(fraction < 1 ? "uploading" : "processing", fraction);
    };
    xhr.upload.onload = () => onProgress?.("processing", 1);

    xhr.onload = () => {
      const body = xhr.response as { error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as UploadedDoc);
      } else {
        reject(new Error(body?.error || `Hata ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Ağ hatası. Bağlantını kontrol et."));
    xhr.onabort = () => reject(new Error("Yükleme iptal edildi"));

    xhr.send(form);
  });
}
