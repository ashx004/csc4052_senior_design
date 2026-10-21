import { NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/src/library/rateLimit";
import { reportError } from "@/src/library/monitoring/errorReporter";

// Receives browser errors from reportClientError.ts. Public on purpose: a page
// can crash before sign-in. Bounded by a per-IP rate limit, a body size cap,
// and the hourly alert-email cap in alertRules.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_000;

const ClientErrorSchema = z.object({
  message: z.string().min(1).max(1000),
  name: z.string().max(200).optional(),
  stack: z.string().max(8000).optional(),
  route: z.string().max(500).optional(),
  digest: z.string().max(200).optional(),
  build: z.string().max(100).optional(),
});

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(`client-errors:${clientIp(request)}`, 60_000, 20);
  if (!limit.allowed) {
    return new Response(null, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds ?? 60) } });
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  let parsed;
  try {
    parsed = ClientErrorSchema.safeParse(JSON.parse(body));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!parsed.success) return new Response(null, { status: 400 });

  // Only the path is kept, never the query string (it can hold ids or tokens).
  const route = parsed.data.route?.split(/[?#]/)[0];
  await reportError({
    ...parsed.data,
    route,
    source: "client",
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
  return new Response(null, { status: 204 });
}
