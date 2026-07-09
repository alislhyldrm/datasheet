import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Client-upload token endpoint for large PDFs (>4.5MB). Only active when a
// Vercel Blob store is configured (BLOB_READ_WRITE_TOKEN). The browser calls
// this to get a short-lived token, uploads the PDF directly to Blob, then
// hands the resulting URL to /api/upload.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: 40 * 1024 * 1024,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // No-op: /api/upload fetches the blob and forwards it to the Files API.
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Blob upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
