import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// HTTP Basic auth over the whole app. The API routes cost real money per
// request, so the gate runs in front of every path rather than just the pages:
// no matcher, so static assets and /_next/data are covered too.
//
// The username is ignored; APP_PASSWORD is the only shared secret.

const REALM = 'Basic realm="datasheet", charset="UTF-8"';

function unauthorized() {
  return new NextResponse("Kimlik doğrulama gerekli", {
    status: 401,
    headers: { "WWW-Authenticate": REALM },
  });
}

// Hashing first gives both sides a fixed 32-byte length, which timingSafeEqual
// requires and which also keeps the password's length from leaking.
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function proxy(request: NextRequest) {
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    // Unset in development means "no gate" so local work stays frictionless.
    // Unset in production is a deploy mistake, and failing open would silently
    // expose the API — refuse to serve instead.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    console.error("[proxy] APP_PASSWORD is not set; refusing all requests");
    return new NextResponse("Sunucu yapılandırılmamış", { status: 500 });
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return unauthorized();
  }

  // "user:password" — the password may itself contain colons.
  const separator = decoded.indexOf(":");
  if (separator === -1) return unauthorized();
  const password = decoded.slice(separator + 1);

  if (!secretsMatch(password, expected)) return unauthorized();

  return NextResponse.next();
}
