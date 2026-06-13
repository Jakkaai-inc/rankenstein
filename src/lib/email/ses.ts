// Outbound "Pending review" notification via Amazon SES.
//
// The AWS SDK is loaded lazily through a non-literal specifier so this module
// compiles and the app boots even before Lane A adds `@aws-sdk/client-ses` to
// package.json (see LANE-REQUESTS). With no SDK or no creds we return a dry-run
// result and log the rendered email — the review UI still works end to end.

import { escapeHtml } from "@/lib/engine/html";

const REGION = process.env.RK_SES_REGION ?? "us-east-1";
const FROM = process.env.RK_MAIL_FROM ?? "Rankenstein <review@rankenstein.app>";
const INBOUND_DOMAIN = process.env.RK_INBOUND_DOMAIN ?? "inbound.rankenstein.app";
const PUBLIC_URL = process.env.RK_PUBLIC_URL ?? "https://rankenstein.app";

export interface PendingReviewPiece {
  id: string;
  title: string | null;
  primaryKeyword: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  kind: string;
}

export interface BuiltEmail {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}

// Reply-To carries the piece id as a plus-address so an inbound reply re-anchors
// to the right piece even if the client rewrites the subject.
export function replyAddress(pieceId: string): string {
  return `review+${pieceId}@${INBOUND_DOMAIN}`;
}

export function buildPendingReviewEmail(piece: PendingReviewPiece, to: string): BuiltEmail {
  const title = piece.title ?? "Untitled piece";
  const link = `${PUBLIC_URL}/review/${piece.id}`;
  const subject = `[rk:${piece.id}] Pending review: ${title}`;
  const kind = piece.kind === "PRODUCT_REWRITE" ? "product rewrite" : "article";

  const text = [
    `A ${kind} is ready for your review: ${title}`,
    piece.primaryKeyword ? `Primary keyword: ${piece.primaryKeyword}` : "",
    "",
    `Open it: ${link}`,
    "",
    "Reply to this email to act without opening the app:",
    "  - Reply \"I approve\" to approve it for publishing.",
    "  - Reply with any other notes to request changes (your reply becomes review feedback).",
    "",
    "Nothing publishes until you approve it.",
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.6">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#6b6b6b;margin:0 0 4px">Pending review</p>
<h1 style="font-size:21px;margin:0 0 6px">${escapeHtml(title)}</h1>
<p style="color:#6b6b6b;margin:0 0 16px">${escapeHtml(kind)}${piece.primaryKeyword ? ` &middot; ${escapeHtml(piece.primaryKeyword)}` : ""}</p>
${piece.metaTitle ? `<p style="margin:0 0 4px"><b>Title:</b> ${escapeHtml(piece.metaTitle)}</p>` : ""}
${piece.metaDescription ? `<p style="margin:0 0 16px;color:#4a4a4a">${escapeHtml(piece.metaDescription)}</p>` : ""}
<p><a href="${link}" style="display:inline-block;background:#b5651d;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Open the review</a></p>
<p style="font-size:14px;color:#4a4a4a;margin-top:20px">Or just reply to this email:<br>
&bull; Reply <b>"I approve"</b> to approve it for publishing.<br>
&bull; Reply with notes to request changes — your reply becomes review feedback.</p>
<p style="font-size:12px;color:#9a9a9a;margin-top:18px">Nothing publishes until you approve it.</p>
</div></body></html>`;

  return { to, from: FROM, replyTo: replyAddress(piece.id), subject, html, text };
}

export interface SendResult {
  sent: boolean;
  dryRun: boolean;
  messageId?: string;
  reason?: string;
  email: BuiltEmail;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadSes(): Promise<any | null> {
  try {
    const spec = "@aws-sdk/client-ses";
    return await import(/* webpackIgnore: true */ /* @vite-ignore */ spec);
  } catch {
    return null;
  }
}

export async function sendPendingReviewEmail(piece: PendingReviewPiece, to: string): Promise<SendResult> {
  const email = buildPendingReviewEmail(piece, to);
  const ses = await loadSes();
  if (!ses) {
    console.log(`[email] SES SDK unavailable — dry run. Would send to ${to}: ${email.subject}`);
    return { sent: false, dryRun: true, reason: "aws-sdk not installed", email };
  }
  try {
    const client = new ses.SESClient({ region: REGION });
    const out = await client.send(
      new ses.SendEmailCommand({
        Source: email.from,
        Destination: { ToAddresses: [email.to] },
        ReplyToAddresses: [email.replyTo],
        Message: {
          Subject: { Data: email.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: email.html, Charset: "UTF-8" },
            Text: { Data: email.text, Charset: "UTF-8" },
          },
        },
      }),
    );
    return { sent: true, dryRun: false, messageId: out?.MessageId, email };
  } catch (err) {
    console.error("[email] SES send failed:", (err as Error).message);
    return { sent: false, dryRun: false, reason: (err as Error).message, email };
  }
}
