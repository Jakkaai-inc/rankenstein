// POST /review/api/inbound — the landing point for inbound review replies.
//
// SES receipt rule -> S3 (rankenstein-inbound-mail) -> SNS/Lambda notification
// hits this route. We accept three shapes so it is easy to drive and test:
//   { key, bucket? }  an S3 object key to fetch + process
//   { raw }           raw MIME directly (local/demo/testing)
//   an SNS envelope   (SubscriptionConfirmation is auto-acked; Notification is unwrapped)
//
// Optional shared-secret gate via the x-rk-inbound-secret header when
// RK_INBOUND_SECRET is set.

import { type NextRequest } from "next/server";

import { handle, json, readJson } from "@/lib/api/http";
import { processInboundEmail, processInboundFromS3 } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const secret = process.env.RK_INBOUND_SECRET;
    if (secret && req.headers.get("x-rk-inbound-secret") !== secret) {
      return json({ error: "forbidden" }, 403);
    }

    const body = (await readJson(req)) as Record<string, unknown>;

    // SNS subscription handshake: confirm by fetching the SubscribeURL.
    if (body?.Type === "SubscriptionConfirmation" && typeof body.SubscribeURL === "string") {
      await fetch(body.SubscribeURL).catch(() => {});
      return json({ ok: true, confirmed: true });
    }

    // SNS notification: the S3/SES event is JSON inside Message.
    let payload = body;
    if (body?.Type === "Notification" && typeof body.Message === "string") {
      try {
        payload = JSON.parse(body.Message);
      } catch {
        /* leave payload as-is */
      }
    }

    if (typeof payload.raw === "string") {
      const result = await processInboundEmail(payload.raw);
      return json(result, result.ok ? 200 : 422);
    }

    // S3 event record, or a plain { key, bucket }.
    const record = Array.isArray((payload as { Records?: unknown[] }).Records)
      ? ((payload as { Records: { s3?: { bucket?: { name?: string }; object?: { key?: string } } }[] }).Records[0]?.s3)
      : undefined;
    const key = (payload.key as string) ?? (record?.object?.key && decodeURIComponent(String(record.object.key).replace(/\+/g, " ")));
    const bucket = (payload.bucket as string) ?? record?.bucket?.name;

    if (!key) return json({ error: "no object key / raw body in request" }, 400);

    const result = await processInboundFromS3(key, bucket);
    return json(result, result.ok ? 200 : 422);
  });
}
