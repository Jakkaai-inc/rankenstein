"use server";

// Server actions for the review loop. Every action re-checks that the signed-in
// account owns the piece before it touches anything. Writes follow the project
// rule: a version is snapshotted before the working copy is replaced, so every
// edit is reversible.

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { makeClient, MODELS } from "@/lib/engine";
import type { CommentAnchor, FeedbackSet, ReviewComment } from "@/types/contracts";
import { surgicalEditPiece, type SpanEditFn } from "./surgical";
import { sendPendingReviewEmail } from "@/lib/email";
import type { NewCommentInput } from "@/components/preview/PiecePreview";

async function ownedPiece(pieceId: string) {
  const account = await getAccount();
  if (!account) throw new Error("UNAUTHENTICATED");
  const piece = await prisma.contentItem.findFirst({
    where: { id: pieceId, project: { accountId: account.id } },
  });
  if (!piece) throw new Error("NOT_FOUND");
  return { account, piece };
}

async function latestVersion(pieceId: string): Promise<number> {
  const agg = await prisma.contentVersion.aggregate({ where: { contentItemId: pieceId }, _max: { version: true } });
  return agg._max.version ?? 1;
}

// Called directly from the client preview with a structured payload.
export async function addComment(input: NewCommentInput): Promise<void> {
  await ownedPiece(input.pieceId);
  await prisma.comment.create({
    data: {
      contentItemId: input.pieceId,
      version: input.version,
      anchor: input.anchor as unknown as object,
      body: input.body,
      modality: input.modality,
    },
  });
  revalidatePath(`/review/${input.pieceId}`);
}

export async function deleteComment(formData: FormData): Promise<void> {
  const pieceId = String(formData.get("pieceId"));
  const commentId = String(formData.get("commentId"));
  await ownedPiece(pieceId);
  await prisma.comment.deleteMany({ where: { id: commentId, contentItemId: pieceId } });
  revalidatePath(`/review/${pieceId}`);
}

// The surgical span editor: rewrite ONLY the highlighted span per the reviewer's
// note, grounded, no invented facts, no em dashes, HTML tags preserved. Uses the
// engine's proven Anthropic client (strong tier, no temperature — Opus rejects it).
const SYSTEM =
  "You are a precise copy editor. You revise exactly one highlighted span of a published-quality product page and return only that span. You never invent facts (no GSM, certifications, prices, reviews, or claims not already present). You never use em dashes. You preserve the surrounding HTML structure and only change the human-readable text inside it. If the reviewer asks you to REMOVE or DELETE content (a row, sentence, clause, or field), do it: return the span with that content removed, keeping any wrapping tags valid (e.g. drop an entire <tr> if a whole table row should go, or return an empty string if the whole span should be deleted). Deletion is allowed; fabrication is not.";

const spanEditor: SpanEditFn = async ({ targetHtml, quote, instruction }) => {
  const client = makeClient();
  const msg = await client.messages.create({
    model: MODELS.strong,
    max_tokens: 1200,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Apply the reviewer's instruction to ONLY this span and return the revised span. Return ONLY the revised span text/HTML, nothing else (no quotes, no explanation, no code fence). If the instruction asks to remove or delete the content, return the span with that content removed (an empty string if the whole span should go).

HIGHLIGHTED SPAN (HTML):
${targetHtml}

PLAIN TEXT OF THE SPAN:
${quote}

REVIEWER INSTRUCTION:
${instruction}`,
      },
    ],
  });
  const out = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n");
  return out
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
};

export interface ApplyReviewOutcome {
  ok: boolean;
  surgical: boolean;
  untouchedSectionsChanged: string[];
  applied: number;
  newVersion?: number;
  error?: string;
  // Per-span before -> after so the UI shows what actually changed (or that
  // nothing did) instead of a blind success banner.
  edits?: { before: string; after: string; changed: boolean }[];
}

export async function applyReview(formData: FormData): Promise<ApplyReviewOutcome> {
  const pieceId = String(formData.get("pieceId"));
  const { piece } = await ownedPiece(pieceId);
  if (!piece.html) return { ok: false, surgical: false, untouchedSectionsChanged: [], applied: 0, error: "piece has no draft html" };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, surgical: false, untouchedSectionsChanged: [], applied: 0, error: "ANTHROPIC_API_KEY not set — cannot run the surgical editor" };
  }

  const version = await latestVersion(pieceId);
  const rows = await prisma.comment.findMany({
    where: { contentItemId: pieceId, version, resolved: false },
    orderBy: { createdAt: "asc" },
  });
  const comments: ReviewComment[] = rows.map((r) => ({
    id: r.id,
    version: r.version,
    anchor: r.anchor as unknown as CommentAnchor,
    body: r.body,
    modality: r.modality === "voice" ? "voice" : "text",
  }));
  if (comments.length === 0) {
    return { ok: false, surgical: true, untouchedSectionsChanged: [], applied: 0, error: "no open comments to apply" };
  }

  const feedback: FeedbackSet = { pieceId, version, comments };
  const result = await surgicalEditPiece(piece.html, feedback, spanEditor);
  const editsView = result.edits.map((e) => ({ before: e.before, after: e.after, changed: e.changed }));

  // Refuse to write anything that touched an uncommented section.
  if (!result.surgical) {
    return { ok: false, surgical: false, untouchedSectionsChanged: result.untouchedSectionsChanged, applied: 0, error: "edit changed sections that were not commented on; not applied", edits: editsView };
  }

  // Honest no-op: the editor ran but changed nothing. Do NOT save a duplicate
  // version or claim success — tell the reviewer so they can rephrase.
  if (result.changed === 0) {
    return {
      ok: false,
      surgical: true,
      untouchedSectionsChanged: [],
      applied: 0,
      error: "The editor made no change to your commented span(s). For a removal, comment \"delete this row/sentence\"; otherwise rephrase the instruction.",
      edits: editsView,
    };
  }

  // Only the comments whose span actually changed are resolved + counted.
  const changedIds = new Set(result.edits.filter((e) => e.changed).map((e) => e.commentId));
  const appliedIds = comments
    .filter((c) => c.anchor.mode === "span" && changedIds.has(c.id))
    .map((c) => c.id);
  const newVersion = version + 1;

  await prisma.$transaction([
    // Snapshot the new draft as a version (the prior version is already stored -> reversible).
    prisma.contentVersion.create({
      data: { contentItemId: pieceId, version: newVersion, html: result.newHtml, note: `surgical edit: ${appliedIds.length} comment(s)` },
    }),
    prisma.contentItem.update({ where: { id: pieceId }, data: { html: result.newHtml, status: "PENDING_REVIEW" } }),
    // Resolve only the comments that actually produced a change. No-op comments
    // stay open so the reviewer can rephrase and re-apply them.
    prisma.comment.updateMany({ where: { id: { in: appliedIds } }, data: { resolved: true } }),
  ]);

  revalidatePath(`/review/${pieceId}`);
  revalidatePath("/review");
  return { ok: true, surgical: true, untouchedSectionsChanged: [], applied: appliedIds.length, newVersion, edits: editsView };
}

export async function approve(formData: FormData): Promise<void> {
  const pieceId = String(formData.get("pieceId"));
  await ownedPiece(pieceId);
  await prisma.contentItem.update({ where: { id: pieceId }, data: { status: "APPROVED" } });
  revalidatePath(`/review/${pieceId}`);
  revalidatePath("/review");
}

export async function requestEmailReview(formData: FormData): Promise<void> {
  const pieceId = String(formData.get("pieceId"));
  const { account, piece } = await ownedPiece(pieceId);
  await sendPendingReviewEmail(
    { id: piece.id, title: piece.title, primaryKeyword: piece.primaryKeyword, metaTitle: piece.metaTitle, metaDescription: piece.metaDescription, kind: piece.kind },
    account.email,
  );
  revalidatePath(`/review/${pieceId}`);
}

export async function rollback(formData: FormData): Promise<void> {
  const pieceId = String(formData.get("pieceId"));
  const toVersion = Number(formData.get("version"));
  await ownedPiece(pieceId);
  const snap = await prisma.contentVersion.findUnique({ where: { contentItemId_version: { contentItemId: pieceId, version: toVersion } } });
  if (!snap) throw new Error("VERSION_NOT_FOUND");
  const newVersion = (await latestVersion(pieceId)) + 1;
  await prisma.$transaction([
    prisma.contentVersion.create({
      data: { contentItemId: pieceId, version: newVersion, html: snap.html, note: `rollback to v${toVersion}` },
    }),
    prisma.contentItem.update({ where: { id: pieceId }, data: { html: snap.html, status: "PENDING_REVIEW" } }),
  ]);
  revalidatePath(`/review/${pieceId}`);
}
