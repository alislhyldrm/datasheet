import { NextResponse } from "next/server";
import { envDefaults } from "@/lib/llm/registry";
import type { ServerConfig } from "@/lib/types";

export const runtime = "nodejs";

// Tells the browser which providers the server already has a key for (from
// .env.local), so nobody has to retype a key the machine already holds, and the
// settings panel can say which providers are usable with an empty key field.
// Only provider ids and a model name cross the wire — never the key.
export async function GET() {
  const body: ServerConfig = envDefaults();
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
