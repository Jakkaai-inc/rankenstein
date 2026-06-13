import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import type { CommentAnchor, GuardrailFlag, ReviewComment, VerifierVerdict } from "@/types/contracts";
import PiecePreview from "@/components/preview/PiecePreview";
import ReviewToolbar from "@/components/preview/ReviewToolbar";
import { addComment, applyReview, approve, requestEmailReview, rollback } from "../actions";
import { publishToStore, rollbackLive } from "../publish";

export const dynamic = "force-dynamic";

function flagClass(sev: string): string {
  return sev === "BAD" ? "border-red-400 bg-red-50" : sev === "GOOD" ? "border-green-400 bg-green-50" : "border-amber-400 bg-amber-50";
}

export default async function ReviewPiecePage({ params }: { params: Promise<{ pieceId: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/");
  const { pieceId } = await params;

  const piece = await prisma.contentItem.findFirst({
    where: { id: pieceId, project: { accountId: account.id } },
    include: {
      versions: { orderBy: { version: "desc" }, select: { version: true, note: true } },
      comments: { orderBy: { createdAt: "asc" } },
      project: { select: { name: true } },
    },
  });
  if (!piece) notFound();

  const currentVersion = piece.versions.length ? Math.max(...piece.versions.map((v) => v.version)) : 1;
  const currentComments: ReviewComment[] = piece.comments
    .filter((c) => c.version === currentVersion && !c.resolved)
    .map((c) => ({ id: c.id, version: c.version, anchor: c.anchor as unknown as CommentAnchor, body: c.body, modality: c.modality === "voice" ? "voice" : "text" }));
  const openSpanCount = currentComments.length;

  const flags = (piece.guardrailFlags as unknown as GuardrailFlag[] | null) ?? [];
  const verdict = piece.verifierVerdict as unknown as VerifierVerdict | null;

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <header>
        <Link href="/review" className="text-sm text-gray-500">← review queue</Link>
        <h1 className="text-2xl font-bold">{piece.title ?? "Untitled"}</h1>
        <p className="text-sm text-gray-500">
          {piece.project.name} · {piece.kind === "PRODUCT_REWRITE" ? "product rewrite" : "article"}
          {piece.primaryKeyword ? ` · ${piece.primaryKeyword}` : ""}
        </p>
      </header>

      <ReviewToolbar
        pieceId={piece.id}
        status={piece.status}
        openComments={openSpanCount}
        versions={piece.versions}
        publishedUrl={piece.publishedUrl}
        applyReview={applyReview}
        approve={approve}
        requestEmailReview={requestEmailReview}
        rollback={rollback}
        publishToStore={publishToStore}
        rollbackLive={rollbackLive}
      />

      {/* Grounding proof: the verifier verdict + guardrail flags that gated this piece. */}
      {(verdict || flags.length > 0) && (
        <section className="rounded-lg border bg-gray-50 p-4 text-sm">
          {verdict && (
            <p className="mb-2">
              <b>Verifier:</b>{" "}
              <span className={verdict.verdict === "pass" ? "text-green-700" : "text-red-700"}>{verdict.verdict}</span>{" "}
              <span className="text-gray-500">({verdict.isSelfCheck ? "self-check" : "independent"})</span>
              {verdict.failures?.length ? <span className="text-red-700"> · {verdict.failures.join("; ")}</span> : ""}
            </p>
          )}
          {flags.map((f, i) => (
            <div key={i} className={`mt-1 rounded border-l-4 px-3 py-1.5 ${flagClass(f.severity)}`}>
              <b className="text-xs uppercase">{f.type} ({f.severity})</b>
              <div className="text-gray-700">{f.note}</div>
            </div>
          ))}
        </section>
      )}

      <PiecePreview
        pieceId={piece.id}
        version={currentVersion}
        html={piece.html ?? "<p>(no draft html)</p>"}
        meta={{
          title: piece.title ?? "",
          slug: piece.slug ?? "",
          metaTitle: piece.metaTitle ?? "",
          metaDescription: piece.metaDescription ?? "",
          primaryKeyword: piece.primaryKeyword ?? "",
        }}
        comments={currentComments}
        addComment={addComment}
        readOnly={piece.status === "APPROVED" || piece.status === "PUBLISHED"}
      />
    </main>
  );
}
