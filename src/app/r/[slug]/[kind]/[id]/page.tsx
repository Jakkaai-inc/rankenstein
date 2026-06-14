import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { findProjectBySlug } from "@/lib/slug";
import type { CommentAnchor, GuardrailFlag, ReviewComment, VerifierVerdict } from "@/types/contracts";
import ReviewShell from "@/components/preview/ReviewShell";
import { detectVolatileFlags } from "@/components/preview/volatile";
import { addComment, approve, getVersionContent } from "@/app/review/actions";
import { publishToStore } from "@/app/review/publish";

export const dynamic = "force-dynamic";

export default async function ReviewPiecePage({ params }: { params: Promise<{ slug: string; kind: string; id: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/login");
  const { slug, id } = await params;

  const project = await findProjectBySlug(account.id, slug);
  if (!project) notFound();

  const piece = await prisma.contentItem.findFirst({
    where: { id, projectId: project.id },
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

  const engineFlags = (piece.guardrailFlags as unknown as GuardrailFlag[] | null) ?? [];
  const volatileFlags = detectVolatileFlags(piece.html ?? "");
  const flags: GuardrailFlag[] = [...engineFlags, ...volatileFlags];
  const verdict = piece.verifierVerdict as unknown as VerifierVerdict | null;

  return (
    <main className="bg-muted/30 min-h-screen">
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <header>
          <Link href={`/p/${slug}/review`} className="text-muted-foreground text-sm hover:underline">← review queue</Link>
          <h1 className="text-2xl font-bold">{piece.title ?? "Untitled"}</h1>
          <p className="text-muted-foreground text-sm">
            {piece.project.name} · {piece.kind === "PRODUCT_REWRITE" ? "product rewrite" : "article"}
            {piece.primaryKeyword ? ` · ${piece.primaryKeyword}` : ""}
          </p>
        </header>

        <ReviewShell
          pieceId={piece.id}
          status={piece.status}
          meta={{
            title: piece.title ?? "",
            slug: piece.slug ?? "",
            metaTitle: piece.metaTitle ?? "",
            metaDescription: piece.metaDescription ?? "",
            primaryKeyword: piece.primaryKeyword ?? "",
          }}
          latestVersion={currentVersion}
          latestHtml={piece.html ?? "<p>(no draft html)</p>"}
          versions={piece.versions}
          comments={currentComments}
          flags={flags}
          verdict={verdict}
          publishedUrl={piece.publishedUrl}
          addComment={addComment}
          approve={approve}
          getVersionContent={getVersionContent}
          publishToStore={publishToStore}
        />
      </div>
    </main>
  );
}
