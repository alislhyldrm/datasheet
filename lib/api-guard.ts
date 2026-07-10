// Shared request guards for the API routes: per-IP rate limiting and the
// blob-URL allowlist that closes the SSRF hole in /api/upload.
//
// The limiter is in-memory, so on serverless each warm instance counts
// separately — it blunts abuse rather than enforcing an exact global quota.
// For hard guarantees put Vercel WAF or a shared store (e.g. Upstash) in front.

const WINDOW_MS = 60_000;

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

function prune(now: number) {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > WINDOW_MS) buckets.delete(key);
  }
}

export function clientIp(req: Request): string {
  // Vercel/proxies set x-forwarded-for; the first hop is the client.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Returns true when the caller is within `limit` requests per minute. */
export function rateLimit(req: Request, scope: string, limit: number): boolean {
  const now = Date.now();
  prune(now);
  const key = `${scope}:${clientIp(req)}`;
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

// Client uploads land on the store's public host; anything else (internal IPs,
// metadata endpoints, other schemes) must never reach fetch() on the server.
export function isAllowedBlobUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname.endsWith(".public.blob.vercel-storage.com")
  );
}

// PDF files must start with "%PDF-" — rejects arbitrary content smuggled in
// with a spoofed content-type before it reaches the Files API.
export function looksLikePdf(buf: Uint8Array): boolean {
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  if (buf.length < magic.length) return false;
  return magic.every((byte, i) => buf[i] === byte);
}
