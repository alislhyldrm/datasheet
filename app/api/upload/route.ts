import { NextRequest, NextResponse } from "next/server";
import { toFile } from "@anthropic-ai/sdk";
import { getClient, FILES_BETA, MAX_PDF_BYTES } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 120;

// Two input modes:
//  - multipart/form-data with a `file` field (small PDFs, <4.5MB on Vercel)
//  - application/json { blobUrl, fileName } (large PDFs uploaded to Vercel Blob first)
export async function POST(req: NextRequest) {
  try {
    const client = getClient();
    const contentType = req.headers.get("content-type") || "";

    let fileName: string;
    let sizeBytes: number;
    let uploaded;

    if (contentType.includes("application/json")) {
      const { blobUrl, fileName: name } = await req.json();
      if (!blobUrl || typeof blobUrl !== "string") {
        return NextResponse.json({ error: "blobUrl gerekli" }, { status: 400 });
      }
      fileName = typeof name === "string" && name ? name : "datasheet.pdf";
      const res = await fetch(blobUrl);
      if (!res.ok) {
        return NextResponse.json(
          { error: "Yüklenen dosya alınamadı" },
          { status: 400 }
        );
      }
      const buf = Buffer.from(await res.arrayBuffer());
      sizeBytes = buf.length;
      if (sizeBytes > MAX_PDF_BYTES) {
        return NextResponse.json(
          { error: "PDF çok büyük (max 40 MB)" },
          { status: 413 }
        );
      }
      uploaded = await client.beta.files.upload({
        file: await toFile(buf, fileName, { type: "application/pdf" }),
        betas: [FILES_BETA],
      });
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
      fileName = file.name || "datasheet.pdf";
      sizeBytes = file.size;
      if (sizeBytes > MAX_PDF_BYTES) {
        return NextResponse.json(
          { error: "PDF çok büyük (max 40 MB)" },
          { status: 413 }
        );
      }
      uploaded = await client.beta.files.upload({
        file: await toFile(file, fileName, { type: "application/pdf" }),
        betas: [FILES_BETA],
      });
    }

    return NextResponse.json({
      fileId: uploaded.id,
      fileName,
      sizeBytes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Yükleme başarısız";
    console.error("[upload]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
