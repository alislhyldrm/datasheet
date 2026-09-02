import { NextRequest, NextResponse } from "next/server";
import { MAX_PDF_BYTES } from "@/lib/limits";
import { looksLikePdf, rateLimit } from "@/lib/api-guard";
import { resolveProvider } from "@/lib/llm/registry";
import { mapProviderError } from "@/lib/llm/errors";
import { ProviderConfigError } from "@/lib/llm/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILENAME_CHARS = 200;

function cleanFileName(name: unknown): string {
  if (typeof name !== "string" || !name.trim()) return "datasheet.pdf";
  return name.trim().slice(0, MAX_FILENAME_CHARS);
}

function str(v: FormDataEntryValue | null): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

// multipart/form-data: a `file` field plus { provider, model, apiKey } for
// BYOK. All three credential fields fall back to env vars when absent.
export async function POST(req: NextRequest) {
  if (!rateLimit(req, "upload", 10)) {
    return NextResponse.json(
      { error: "Çok fazla yükleme. Bir dakika sonra tekrar deneyin." },
      { status: 429 },
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 400 });
    }
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Yalnızca PDF dosyaları desteklenir" },
        { status: 415 },
      );
    }

    const fileName = cleanFileName(file.name);
    const buf = Buffer.from(await file.arrayBuffer());

    if (buf.length > MAX_PDF_BYTES) {
      return NextResponse.json(
        { error: `PDF çok büyük (max ${MAX_PDF_BYTES / (1024 * 1024)} MB)` },
        { status: 413 },
      );
    }
    if (!looksLikePdf(buf)) {
      return NextResponse.json(
        { error: "Dosya geçerli bir PDF değil" },
        { status: 415 },
      );
    }

    const { adapter, apiKey } = resolveProvider(
      str(form.get("provider")),
      str(form.get("model")),
      str(form.get("apiKey")),
    );

    try {
      const ref = await adapter.uploadDocument({ apiKey, fileName, bytes: buf });
      return NextResponse.json({
        fileId: ref.id,
        fileName: ref.fileName,
        sizeBytes: ref.sizeBytes,
        provider: ref.provider,
      });
    } catch (err) {
      console.error("[upload]", err);
      return NextResponse.json(
        { error: mapProviderError(adapter.id, err) },
        { status: 502 },
      );
    }
  } catch (err) {
    if (err instanceof ProviderConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[upload]", err);
    return NextResponse.json({ error: "Yükleme başarısız" }, { status: 500 });
  }
}
