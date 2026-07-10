import { NextRequest, NextResponse } from "next/server";
import { toFile } from "@anthropic-ai/sdk";
import { del } from "@vercel/blob";
import { getClient, FILES_BETA, MAX_PDF_BYTES } from "@/lib/anthropic";
import { isAllowedBlobUrl, looksLikePdf, rateLimit } from "@/lib/api-guard";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILENAME_CHARS = 200;

function cleanFileName(name: unknown): string {
  if (typeof name !== "string" || !name.trim()) return "datasheet.pdf";
  return name.trim().slice(0, MAX_FILENAME_CHARS);
}

// Two input modes:
//  - multipart/form-data with a `file` field (small PDFs, <4.5MB on Vercel)
//  - application/json { blobUrl, fileName } (large PDFs uploaded to Vercel Blob first)
export async function POST(req: NextRequest) {
  if (!rateLimit(req, "upload", 10)) {
    return NextResponse.json(
      { error: "Çok fazla yükleme. Bir dakika sonra tekrar deneyin." },
      { status: 429 }
    );
  }

  try {
    const client = getClient();
    const contentType = req.headers.get("content-type") || "";

    let fileName: string;
    let buf: Buffer;
    // Set for the blob path: the staged object is disposable once its bytes
    // are in hand, and leaving it would let the store serve attacker content.
    let stagedBlobUrl: string | null = null;

    if (contentType.includes("application/json")) {
      const { blobUrl, fileName: name } = await req.json();
      if (typeof blobUrl !== "string" || !isAllowedBlobUrl(blobUrl)) {
        return NextResponse.json(
          { error: "Geçersiz blob URL" },
          { status: 400 }
        );
      }
      stagedBlobUrl = blobUrl;
      fileName = cleanFileName(name);
      const res = await fetch(blobUrl);
      if (!res.ok) {
        await discardBlob(stagedBlobUrl);
        return NextResponse.json(
          { error: "Yüklenen dosya alınamadı" },
          { status: 400 }
        );
      }
      buf = Buffer.from(await res.arrayBuffer());
    } else {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 400 });
      }
      if (file.type && file.type !== "application/pdf") {
        return NextResponse.json(
          { error: "Yalnızca PDF dosyaları desteklenir" },
          { status: 415 }
        );
      }
      fileName = cleanFileName(file.name);
      buf = Buffer.from(await file.arrayBuffer());
    }

    if (buf.length > MAX_PDF_BYTES) {
      await discardBlob(stagedBlobUrl);
      return NextResponse.json(
        { error: "PDF çok büyük (max 40 MB)" },
        { status: 413 }
      );
    }
    if (!looksLikePdf(buf)) {
      await discardBlob(stagedBlobUrl);
      return NextResponse.json(
        { error: "Dosya geçerli bir PDF değil" },
        { status: 415 }
      );
    }

    const uploaded = await client.beta.files.upload({
      file: await toFile(buf, fileName, { type: "application/pdf" }),
      betas: [FILES_BETA],
    });
    await discardBlob(stagedBlobUrl);

    return NextResponse.json({
      fileId: uploaded.id,
      fileName,
      sizeBytes: buf.length,
    });
  } catch (err) {
    // Log the real error server-side; never echo internals to the client.
    console.error("[upload]", err);
    return NextResponse.json({ error: "Yükleme başarısız" }, { status: 500 });
  }
}

// Best-effort cleanup; a leftover blob is a storage leak, not a broken upload.
async function discardBlob(url: string | null) {
  if (!url) return;
  try {
    await del(url);
  } catch (err) {
    console.error("[upload] blob cleanup failed", err);
  }
}
