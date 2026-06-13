// Shared plumbing for the /api/v1 route handlers: bearer auth, a uniform JSON
// envelope, and error mapping (ServiceError -> its status, ZodError -> 400).

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { resolveSession } from "@/lib/services/auth";
import { ServiceError, UnauthenticatedError } from "@/lib/services/errors";

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token.trim() : null;
}

/** Resolve the bearer token to an account or throw 401. */
export async function requireAccount(req: NextRequest) {
  const account = await resolveSession(bearerToken(req));
  if (!account) throw new UnauthenticatedError();
  return account;
}

/** Wrap a handler body so thrown ServiceError/ZodError become clean responses. */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, err.status);
    if (err instanceof ZodError) return json({ error: "invalid request", details: err.issues }, 400);
    if (err instanceof SyntaxError) return json({ error: "invalid JSON body" }, 400);
    console.error("[api/v1] unhandled error:", err);
    return json({ error: "internal error" }, 500);
  }
}

/** Parse a JSON body, tolerating an empty body as {}. */
export async function readJson(req: NextRequest): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  return JSON.parse(text);
}
