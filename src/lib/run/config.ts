// RunConfig <-> DB mapping. The DB stores `quality` and `layers` as Json; this
// module parses them into typed shapes and provides the per-project defaults that
// match prisma/schema.prisma's RunConfig column defaults.

import type { QualityKnobs, LayerToggles } from "@/types/contracts";
import type { ChecklistConfig } from "./checklist";

export const RUN_CONFIG_DEFAULTS: ChecklistConfig = {
  contentType: "product",
  goal: "improve_product",
  depth: "standard",
  readability: "standard",
  groundedness: "strict",
  quality: { tables: true, quotes: false, kpiChips: true, charts: false, images: false },
  layers: { angle: true, aeo: true, citationVerify: true, imageGen: false },
  perPieceTokenCeiling: 120000,
  runSpendSoftStopUsd: 400,
};

export function parseQuality(json: unknown): QualityKnobs {
  const j = (json ?? {}) as Record<string, unknown>;
  const d = RUN_CONFIG_DEFAULTS.quality;
  return {
    tables: typeof j.tables === "boolean" ? j.tables : d.tables,
    quotes: typeof j.quotes === "boolean" ? j.quotes : d.quotes,
    kpiChips: typeof j.kpiChips === "boolean" ? j.kpiChips : d.kpiChips,
    charts: typeof j.charts === "boolean" ? j.charts : d.charts,
    images: typeof j.images === "boolean" ? j.images : d.images,
  };
}

export function parseLayers(json: unknown): LayerToggles {
  const j = (json ?? {}) as Record<string, unknown>;
  const d = RUN_CONFIG_DEFAULTS.layers;
  return {
    angle: typeof j.angle === "boolean" ? j.angle : d.angle,
    aeo: typeof j.aeo === "boolean" ? j.aeo : d.aeo,
    citationVerify: typeof j.citationVerify === "boolean" ? j.citationVerify : d.citationVerify,
    imageGen: typeof j.imageGen === "boolean" ? j.imageGen : d.imageGen,
  };
}

/** A DB RunConfig row (the subset the checklist needs). */
export interface RunConfigRow {
  contentType: string;
  goal: string;
  depth: string;
  readability: string;
  groundedness: string;
  quality: unknown;
  layers: unknown;
  perPieceTokenCeiling: number;
  runSpendSoftStopUsd: number;
}

function pick<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function toChecklistConfig(row: RunConfigRow | null): ChecklistConfig {
  if (!row) return RUN_CONFIG_DEFAULTS;
  return {
    contentType: pick(row.contentType, ["product", "article"] as const, RUN_CONFIG_DEFAULTS.contentType),
    goal: pick(row.goal, ["new_articles", "update_articles", "improve_product"] as const, RUN_CONFIG_DEFAULTS.goal),
    depth: pick(row.depth, ["brief", "standard", "deep"] as const, RUN_CONFIG_DEFAULTS.depth),
    readability: pick(row.readability, ["simple", "standard", "technical"] as const, RUN_CONFIG_DEFAULTS.readability),
    groundedness: pick(row.groundedness, ["strict", "balanced"] as const, RUN_CONFIG_DEFAULTS.groundedness),
    quality: parseQuality(row.quality),
    layers: parseLayers(row.layers),
    perPieceTokenCeiling: Number.isFinite(row.perPieceTokenCeiling) ? row.perPieceTokenCeiling : RUN_CONFIG_DEFAULTS.perPieceTokenCeiling,
    runSpendSoftStopUsd: Number.isFinite(row.runSpendSoftStopUsd) ? row.runSpendSoftStopUsd : RUN_CONFIG_DEFAULTS.runSpendSoftStopUsd,
  };
}
