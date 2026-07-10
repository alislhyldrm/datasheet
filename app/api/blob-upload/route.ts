import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/api-guard";
import { MAX_PDF_BYTES } from "@/lib/anthropic";

export const runtime = "nodejs";

// Client-upload token endpoint for large PDFs. Vercel caps a serverless
// function's request body at ~4.5MB, so anything bigger cannot be POSTed to
// /api/upload directly — the browser gets a short-lived token here, uploads
// straight to the Blob store, and hands the resulting URL to /api/upload.
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!rateLimit(req, "blob-upload", 10)) {
    return NextResponse.json(
      { error: "Çok fazla yükleme. Bir dakika sonra tekrar deneyin." },
      { status: 429 }
    );
  }

  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: MAX_PDF_BYTES,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // No-op: /api/upload fetches the blob and forwards it to the Files API.
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[blob-upload]", err);
    return NextResponse.json({ error: "Yükleme başarısız" }, { status: 400 });
  }
}
