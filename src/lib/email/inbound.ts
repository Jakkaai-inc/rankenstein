// Inbound reply handling. SES receipt rule drops raw MIME into the
// rankenstein-inbound-mail S3 bucket (us-east-1); a notification hands us the
// object key. We read it, classify the reply, and act on the piece:
//   "I approve"  -> status APPROVED (+ an audit comment)
//   anything else -> a global review comment + status CHANGES_REQUESTED
//
// Like ses.ts, the S3 client is loaded lazily so the build never depends on the
// AWS SDK being present.

import { prisma } from "@/lib/db";
import { parseInbound, type ParsedInbound } from "./parse";

const BUCKET = process.env.RK_INBOUND_BUCKET ?? "rankenstein-inbound-mail";
const REGION = process.env.RK_S3_REGION ?? "us-east-1";

export interface InboundResult {
  ok: boolean;
  action: "approved" | "feedback" | "ignored";
  pieceId: string | null;
  parsed: ParsedInbound;
  detail: string;
}

// A tiny seam over the prisma calls we touch, so the logic is unit-testable
// without a database.
export interface InboundStore {
  findPiece(id: string): Promise<{ id: string; status: string } | null>;
  approve(id: string, by: string): Promise<void>;
  requestChanges(id: string, feedback: string, by: string): Promise<void>;
}

export const prismaInboundStore: InboundStore = {
  async findPiece(id) {
    return prisma.contentItem.findUnique({ where: { id }, select: { id: true, status: true } });
  },
  async approve(id, by) {
    const latest = await prisma.contentVersion.aggregate({ where: { contentItemId: id }, _max: { version: true } });
    await prisma.$transaction([
      prisma.comment.create({
        data: { contentItemId: id, version: latest._max.version ?? 1, anchor: { mode: "global" }, body: `Approved by email reply (${by})`, modality: "text", resolved: true },
      }),
      prisma.contentItem.update({ where: { id }, data: { status: "APPROVED" } }),
    ]);
  },
  async requestChanges(id, feedback, by) {
    const latest = await prisma.contentVersion.aggregate({ where: { contentItemId: id }, _max: { version: true } });
    await prisma.$transaction([
      prisma.comment.create({
        data: { contentItemId: id, version: latest._max.version ?? 1, anchor: { mode: "global" }, body: `${feedback}\n\n— via email reply (${by})`, modality: "text" },
      }),
      prisma.contentItem.update({ where: { id }, data: { status: "CHANGES_REQUESTED" } }),
    ]);
  },
};

export async function processInboundEmail(raw: string, store: InboundStore = prismaInboundStore): Promise<InboundResult> {
  const parsed = parseInbound(raw);
  if (!parsed.pieceId) {
    return { ok: false, action: "ignored", pieceId: null, parsed, detail: "no piece id in subject/headers" };
  }
  const piece = await store.findPiece(parsed.pieceId);
  if (!piece) {
    return { ok: false, action: "ignored", pieceId: parsed.pieceId, parsed, detail: "piece not found" };
  }
  // A published piece is terminal for the email loop; do not reopen it by reply.
  if (piece.status === "PUBLISHED") {
    return { ok: false, action: "ignored", pieceId: piece.id, parsed, detail: "piece already published" };
  }

  if (parsed.intent === "approve") {
    await store.approve(piece.id, parsed.from);
    return { ok: true, action: "approved", pieceId: piece.id, parsed, detail: "approved via reply" };
  }
  if (parsed.reply.trim()) {
    await store.requestChanges(piece.id, parsed.reply.trim(), parsed.from);
    return { ok: true, action: "feedback", pieceId: piece.id, parsed, detail: "feedback recorded" };
  }
  return { ok: false, action: "ignored", pieceId: piece.id, parsed, detail: "empty reply" };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadS3(): Promise<any | null> {
  try {
    const spec = "@aws-sdk/client-s3";
    return await import(/* webpackIgnore: true */ /* @vite-ignore */ spec);
  } catch {
    return null;
  }
}

export async function fetchInboundObject(key: string, bucket = BUCKET): Promise<string> {
  const s3mod = await loadS3();
  if (!s3mod) throw new Error("aws-sdk not installed — cannot fetch inbound object");
  const client = new s3mod.S3Client({ region: REGION });
  const out = await client.send(new s3mod.GetObjectCommand({ Bucket: bucket, Key: key }));
  return await out.Body.transformToString();
}

// Convenience for the inbound route: fetch from S3 then process.
export async function processInboundFromS3(key: string, bucket = BUCKET): Promise<InboundResult> {
  const raw = await fetchInboundObject(key, bucket);
  return processInboundEmail(raw);
}
