"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAccount, requireAccount, signIn, signOut } from "@/lib/session";
import { confirmBrand, draftBrandForProject } from "@/lib/services/brand";
import { createProject as createProjectSvc } from "@/lib/services/projects";

// Server actions are thin FormData adapters over the shared service layer
// (src/lib/services/*). The same services back the /api/v1 routes the mobile
// app calls, so web and mobile never drift.

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
  const project = await createProjectSvc(account.id, {
    name: String(formData.get("name") ?? ""),
    siteUrl: String(formData.get("siteUrl") ?? ""),
  });
  redirect(`/projects/${project.id}`);
}

export async function draftBrand(formData: FormData) {
  const account = await requireAccount();
  const projectId = String(formData.get("projectId"));
  await draftBrandForProject(account.id, projectId);
  revalidatePath(`/projects/${projectId}`);
}

export async function confirmBrandProfile(formData: FormData) {
  const account = await requireAccount();
  const projectId = String(formData.get("projectId"));
  await confirmBrand(account.id, projectId, {
    brandName: String(formData.get("brandName") ?? ""),
    industry: String(formData.get("industry") ?? ""),
    audience: String(formData.get("audience") ?? ""),
    voice: String(formData.get("voice") ?? ""),
    brandFacts: String(formData.get("brandFacts") ?? ""),
    seedTopics: String(formData.get("seedTopics") ?? "").split(","),
    competitors: String(formData.get("competitors") ?? "").split(","),
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function ensureAccountForDev() {
  // convenience for local: nothing if already signed in
  return getAccount();
}
