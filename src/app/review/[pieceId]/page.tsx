import { notFound, redirect } from "next/navigation";

import { getAccount } from "@/lib/session";
import { prisma } from "@/lib/db";
import { deriveSlug } from "@/lib/slug";

// Old route: /review/[pieceId] -> /r/[slug]/[kind]/[id]
// Kept as a redirect for email links and bookmarks (Lane D email links here).
export default async function ReviewPieceRedirect({ params }: { params: Promise<{ pieceId: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/login");
  const { pieceId } = await params;
  const piece = await prisma.contentItem.findFirst({
    where: { id: pieceId, project: { accountId: account.id } },
    select: { id: true, kind: true, project: { select: { name: true, siteUrl: true, shopify: { select: { shopDomain: true } } } } },
  });
  if (!piece) notFound();
  const slug = deriveSlug(piece.project);
  const kind = piece.kind === "ARTICLE" ? "article" : "product";
  redirect(`/r/${slug}/${kind}/${piece.id}`);
}
