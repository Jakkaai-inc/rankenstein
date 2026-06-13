import { notFound, redirect } from "next/navigation";

import { getAccount } from "@/lib/session";
import { prisma } from "@/lib/db";
import { deriveSlug } from "@/lib/slug";

// Old route: /projects/[id] -> /p/[slug]/overview
export default async function ProjectIdRedirect({ params }: { params: Promise<{ id: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/login");
  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, accountId: account.id }, include: { shopify: { select: { shopDomain: true } } } });
  if (!project) notFound();
  redirect(`/p/${deriveSlug(project)}/overview`);
}
