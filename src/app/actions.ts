"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getAccount, requireAccount, signIn, signOut } from "@/lib/session";

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || undefined;
  if (!email) throw new Error("email required");
  await signIn(email, name);
  redirect("/projects");
}

export async function signOutAction() {
  await signOut();
  redirect("/");
}

export async function createProject(formData: FormData) {
  const account = await requireAccount();
  const name = String(formData.get("name") ?? "").trim();
  const rawUrl = String(formData.get("siteUrl") ?? "").trim();
  if (!name || !rawUrl) throw new Error("name and site URL required");
  const siteUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

  const project = await prisma.project.create({
    data: { accountId: account.id, name, siteUrl },
  });
  // Kick off the crawl → brand-draft flow (Lane A task 17 handler).
  await prisma.run.create({
    data: { projectId: project.id, status: "QUEUED", log: [{ at: new Date().toISOString(), phase: "queued", message: "crawl + brand draft" }] },
  });
  redirect(`/projects/${project.id}`);
}

export async function confirmBrandProfile(formData: FormData) {
  await requireAccount();
  const projectId = String(formData.get("projectId"));
  const seedTopics = String(formData.get("seedTopics") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (seedTopics.length === 0) throw new Error("add at least one seed topic — research starts from these");

  const data = {
    brandName: String(formData.get("brandName") ?? "").trim() || "Unnamed brand",
    industry: String(formData.get("industry") ?? "").trim() || null,
    audience: String(formData.get("audience") ?? ""),
    voice: String(formData.get("voice") ?? ""),
    brandFacts: String(formData.get("brandFacts") ?? ""),
    seedTopics,
    competitors: String(formData.get("competitors") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    confirmed: true,
    confirmedAt: new Date(),
  };
  await prisma.brandProfile.upsert({
    where: { projectId },
    create: { projectId, ...data },
    update: data,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function ensureAccountForDev() {
  // convenience for local: nothing if already signed in
  return getAccount();
}
