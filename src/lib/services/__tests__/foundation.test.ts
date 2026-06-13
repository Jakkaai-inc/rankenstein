import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";

import { bearerToken } from "@/lib/api/http";
import { normalizeSiteUrl } from "@/lib/services/projects";

function reqWith(headers: Record<string, string>): NextRequest {
  return new Request("http://localhost/api/v1/me", { headers }) as unknown as NextRequest;
}

describe("normalizeSiteUrl", () => {
  it("adds https:// when scheme is missing", () => {
    expect(normalizeSiteUrl("ezfabricinc.com")).toBe("https://ezfabricinc.com");
  });
  it("preserves an explicit scheme", () => {
    expect(normalizeSiteUrl("http://ezfabricinc.com")).toBe("http://ezfabricinc.com");
    expect(normalizeSiteUrl("https://ezfabricinc.com")).toBe("https://ezfabricinc.com");
  });
  it("trims surrounding whitespace", () => {
    expect(normalizeSiteUrl("  ezfabricinc.com  ")).toBe("https://ezfabricinc.com");
  });
});

describe("bearerToken", () => {
  it("extracts the token from a Bearer header (scheme case-insensitive)", () => {
    expect(bearerToken(reqWith({ authorization: "Bearer abc123" }))).toBe("abc123");
    expect(bearerToken(reqWith({ authorization: "bearer abc123" }))).toBe("abc123");
  });
  it("returns null for a missing or malformed header", () => {
    expect(bearerToken(reqWith({}))).toBeNull();
    expect(bearerToken(reqWith({ authorization: "Basic abc123" }))).toBeNull();
    expect(bearerToken(reqWith({ authorization: "Bearer" }))).toBeNull();
  });
});
