import type { UploadedDoc } from "./types";

// The ~4.5MB Vercel serverless body limit only exists on Vercel. Running
// self-hosted (localhost / on-prem, no Vercel Blob), a plain Node server has
// no such cap, so every PDF goes straight through /api/upload and the Blob
// detour below stays dead. Set to MAX_BYTES to disable it entirely.
const DIRECT_LIMIT = 100 * 1024 * 1024;
// Mirrors MAX_PDF_BYTES in lib/anthropic.ts, which is server-only. Checking it
// here turns a wasted 100MB upload into an instant, specific error.
const MAX_BYTES = 100 * 1024 * 1024;
// The blob upload is the long part; the server still has to fetch it and hand
// it to Anthropic, so leave headroom rather than sitting at 100% while waiting.
const BLOB_SHARE = 0.95;

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
  if (file.size > MAX_BYTES) {
    return `PDF 100 MB sınırını aşıyor (${formatMb(file.size)}). Daha küçük bir dosya seç.`;
  }
  return null;
}

export async function uploadPdf(
  file: File,
  onProgress?: ProgressHandler,
): Promise<UploadedDoc> {
  const invalid = validatePdf(file);
  if (invalid) throw new Error(invalid);

  if (file.size <= DIRECT_LIMIT) {
    return postDirect(file, onProgress);
  }

  // Large file: client-direct upload to Vercel Blob, then hand the URL back.
  const { upload } = await import("@vercel/blob/client");
  let blob;
  try {
    blob = await upload(file.name, file, {
      access: "private",
      handleUploadUrl: "/api/blob-upload",
      contentType: "application/pdf",
      onUploadProgress: ({ percentage }) =>
        onProgress?.("uploading", (percentage / 100) * BLOB_SHARE),
    });
  } catch {
    throw new Error(
      "Büyük dosya yükleme yapılandırılmamış (Vercel Blob gerekli). 4 MB altı PDF deneyin.",
    );
  }

  onProgress?.("processing", 1);
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blobUrl: blob.url, fileName: file.name }),
  });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

// fetch() cannot report upload progress; XMLHttpRequest still can.
function postDirect(
  file: File,
  onProgress?: ProgressHandler,
): Promise<UploadedDoc> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

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

async function errorText(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j.error || `Hata ${res.status}`;
  } catch {
    return `Hata ${res.status}`;
  }
}
