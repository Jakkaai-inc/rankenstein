"use server";

// Integrator seam (Lane A): wire the review UI's human-approval gate to Lane B's
// live publish + rollback. Publishing requires status=APPROVED (Lane B enforces),
// snapshots the live store state before the push, and supports one-click rollback
// that re-pushes the pre-publish snapshot. Ownership is re-checked here.

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { publishContentItem, rollbackContentItem } from "@/lib/shopify";

async function ownedPiece(pieceId: string) {
  const account = await getAccount();
  if (!account) throw new Error("UNAUTHENTICATED");
  const piece = await prisma.contentItem.findFirst({ where: { id: pieceId, project: { accountId: account.id } } });
  if (!piece) throw new Error("NOT_FOUND");
  return piece;
}

export interface PublishOutcome {
  ok: boolean;
  publishedUrl?: string | null;
  snapshotVersion?: number;
  error?: string;
}

/** Publish an APPROVED piece to the live store (snapshot-first). */
export async function publishToStore(formData: FormData): Promise<PublishOutcome> {
  const pieceId = String(formData.get("pieceId"));
  await ownedPiece(pieceId);
  try {
    const r = await publishContentItem(pieceId);
    revalidatePath(`/review/${pieceId}`);
    revalidatePath("/review");
    return { ok: true, publishedUrl: r.publishedUrl, snapshotVersion: r.snapshotVersion };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface LiveRollbackOutcome {
  ok: boolean;
  restoredVersion?: number;
  error?: string;
}

/** One-click live rollback: re-push the pre-publish snapshot to the store. */
export async function rollbackLive(formData: FormData): Promise<LiveRollbackOutcome> {
  const pieceId = String(formData.get("pieceId"));
  await ownedPiece(pieceId);
  try {
    const r = await rollbackContentItem(pieceId);
    revalidatePath(`/review/${pieceId}`);
    revalidatePath("/review");
    return { ok: true, restoredVersion: r.restoredVersion };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
