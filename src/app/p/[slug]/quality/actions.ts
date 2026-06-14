"use server";

import { revalidatePath } from "next/cache";

import { requireAccount } from "@/lib/session";
import { prisma } from "@/lib/db";
import { deriveSlug } from "@/lib/slug";
import { RUN_CONFIG_DEFAULTS } from "@/lib/run/config";
import { presetToCron, validateCron, type CronCadence } from "@/lib/run/cron";

function oneOf<T extends string>(fd: FormData, key: string, allowed: readonly T[], fallback: T): T {
  const v = String(fd.get(key) ?? "");
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function checked(fd: FormData, key: string): boolean {
  return fd.get(key) != null;
}

function num(fd: FormData, key: string, fallback: number, min: number): number {
  const n = Number(fd.get(key));
  if (!Number.isFinite(n) || n < min) return fallback;
  return n;
}

export async function saveRunConfig(projectId: string, formData: FormData) {
  const account = await requireAccount();

  // ownership check — never trust the bound projectId alone
  const project = await prisma.project.findFirst({
    where: { id: projectId, accountId: account.id },
    include: { shopify: { select: { shopDomain: true } } },
  });
  if (!project) throw new Error("project not found");

  const data = {
    contentType: oneOf(formData, "contentType", ["product", "article"] as const, RUN_CONFIG_DEFAULTS.contentType),
    goal: oneOf(formData, "goal", ["new_articles", "update_articles", "improve_product"] as const, RUN_CONFIG_DEFAULTS.goal),
    depth: oneOf(formData, "depth", ["brief", "standard", "deep"] as const, RUN_CONFIG_DEFAULTS.depth),
    readability: oneOf(formData, "readability", ["simple", "standard", "technical"] as const, RUN_CONFIG_DEFAULTS.readability),
    groundedness: oneOf(formData, "groundedness", ["strict", "balanced"] as const, RUN_CONFIG_DEFAULTS.groundedness),
    quality: {
      tables: checked(formData, "q_tables"),
      quotes: checked(formData, "q_quotes"),
      kpiChips: checked(formData, "q_kpiChips"),
      charts: checked(formData, "q_charts"),
      images: checked(formData, "q_images"),
    },
    layers: {
      angle: checked(formData, "layer_angle"),
      aeo: checked(formData, "layer_aeo"),
      citationVerify: checked(formData, "layer_citationVerify"),
      imageGen: checked(formData, "layer_imageGen"),
    },
    perPieceTokenCeiling: num(formData, "perPieceTokenCeiling", RUN_CONFIG_DEFAULTS.perPieceTokenCeiling, 1000),
    runSpendSoftStopUsd: num(formData, "runSpendSoftStopUsd", RUN_CONFIG_DEFAULTS.runSpendSoftStopUsd, 1),
  };

  const existing = await prisma.runConfig.findFirst({
    where: { projectId: project.id, name: "Default" },
    select: { id: true },
  });
  if (existing) {
    await prisma.runConfig.update({ where: { id: existing.id }, data });
  } else {
    await prisma.runConfig.create({ data: { ...data, name: "Default", projectId: project.id } });
  }

  revalidatePath(`/p/${deriveSlug(project)}/quality`);
}

// Persist the recurring-run schedule (RunConfig.scheduleCron). Separate from
// saveRunConfig so each upsert only touches its own fields and they never
// clobber each other. A cadence preset maps to a cron; "custom" takes a raw,
// validated expression; "off" clears the schedule.
export async function saveSchedule(projectId: string, formData: FormData) {
  const account = await requireAccount();
  const project = await prisma.project.findFirst({
    where: { id: projectId, accountId: account.id },
    include: { shopify: { select: { shopDomain: true } } },
  });
  if (!project) throw new Error("project not found");

  const cadence = oneOf(
    formData,
    "cadence",
    ["off", "daily", "weekly", "monthly", "custom"] as const,
    "off",
  ) as CronCadence;

  let scheduleCron: string | null;
  if (cadence === "custom") {
    const raw = String(formData.get("customCron") ?? "").trim();
    if (!raw) {
      scheduleCron = null;
    } else {
      const v = validateCron(raw);
      if (!v.ok) throw new Error(`Invalid cron expression: ${v.error}`);
      scheduleCron = raw;
    }
  } else {
    scheduleCron = presetToCron(cadence);
  }

  const existing = await prisma.runConfig.findFirst({
    where: { projectId: project.id, name: "Default" },
    select: { id: true },
  });
  if (existing) {
    await prisma.runConfig.update({ where: { id: existing.id }, data: { scheduleCron } });
  } else {
    await prisma.runConfig.create({ data: { name: "Default", projectId: project.id, scheduleCron } });
  }

  revalidatePath(`/p/${deriveSlug(project)}/quality`);
}
