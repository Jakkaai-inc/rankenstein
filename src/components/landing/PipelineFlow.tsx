"use client";

import { useEffect, useRef, useState } from "react";
import {
  Database,
  Search,
  Filter,
  Crosshair,
  GitBranch,
  PenLine,
  Sparkles,
  Link2,
  ShieldAlert,
  Ruler,
  ScanEye,
  UserCheck,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Worker = "code" | "fast agent" | "strong agent" | "human";

type Phase = {
  id: string;
  label: string;
  icon: LucideIcon;
  worker: Worker;
  blurb: string;
};

// Mirrors inputs/LAYER-CONTRACTS.md — the real per-piece workflow stages.
const PHASES: Phase[] = [
  { id: "ground", label: "Ground", icon: Database, worker: "code", blurb: "Build the FactsTable. Only verified product data may ever be claimed." },
  { id: "research", label: "Research", icon: Search, worker: "fast agent", blurb: "Pull raw keyword candidates from web or Ahrefs. Never fabricate volumes." },
  { id: "filter", label: "Filter", icon: Filter, worker: "code", blurb: "Drop head terms, SKUs, competitor brands. Deterministic, not delegated." },
  { id: "serp", label: "SERP Ownership", icon: Crosshair, worker: "fast agent", blurb: "Score every candidate winnable / stretch / no against your site authority." },
  { id: "select", label: "Select", icon: GitBranch, worker: "strong agent", blurb: "Pick primary + secondaries through the cannibalization firewall." },
  { id: "generate", label: "Generate", icon: PenLine, worker: "strong agent", blurb: "Brand-voice-locked draft or product rewrite. Inline-cited, semantic HTML." },
  { id: "aeo", label: "AEO Optimize", icon: Sparkles, worker: "fast agent", blurb: "3-sentence test, extractability, one-paragraph test for answer engines." },
  { id: "cite", label: "Citation Verify", icon: Link2, worker: "fast agent", blurb: "Every source loads and actually supports its claim, or it gets replaced." },
  { id: "guardrails", label: "Guardrails", icon: ShieldAlert, worker: "code", blurb: "Trademark, regulated-claims, data-gap flags. Refuse and flag, never fudge." },
  { id: "gates", label: "Gates", icon: Ruler, worker: "code", blurb: "No em dashes, no emoji headings, one h1, valid JSON-LD, meta lengths." },
  { id: "verify", label: "Verify", icon: ScanEye, worker: "strong agent", blurb: "Independent grader, fresh context, scores against the rubric. Two fails self-flags." },
  { id: "review", label: "Human Review", icon: UserCheck, worker: "human", blurb: "Anchored comments drive a provably-surgical revision. Nothing skips this." },
  { id: "publish", label: "Publish", icon: Rocket, worker: "human", blurb: "Snapshot, push live to Shopify, one-click rollback. Approval required. Ever." },
];

const WORKER_STYLE: Record<Worker, { dot: string; chip: string }> = {
  code: { dot: "bg-zinc-400", chip: "text-zinc-600 dark:text-zinc-300 border-zinc-300/60 dark:border-zinc-600/60" },
  "fast agent": { dot: "bg-sky-400", chip: "text-sky-700 dark:text-sky-300 border-sky-400/50" },
  "strong agent": { dot: "bg-violet-400", chip: "text-violet-700 dark:text-violet-300 border-violet-400/50" },
  human: { dot: "bg-emerald-400", chip: "text-emerald-700 dark:text-emerald-300 border-emerald-400/50" },
};

export function PipelineFlow() {
  const [active, setActive] = useState(0);
  const [running, setRunning] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // advance the active phase on a timer; pauses when scrolled out of view
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setActive((a) => (a + 1) % PHASES.length);
    }, 1400);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setRunning(entry.isIntersecting),
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const current = PHASES[active];

  return (
    <div ref={containerRef} className="w-full">
      {/* worker legend */}
      <div className="mb-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        {(Object.keys(WORKER_STYLE) as Worker[]).map((w) => (
          <span key={w} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", WORKER_STYLE[w].dot)} />
            {w}
          </span>
        ))}
      </div>

      {/* the rail */}
      <div className="relative">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-[repeat(13,minmax(0,1fr))]">
          {PHASES.map((p, i) => {
            const Icon = p.icon;
            const isActive = i === active;
            const isDone = i < active;
            const style = WORKER_STYLE[p.worker];
            return (
              <button
                key={p.id}
                onClick={() => setActive(i)}
                aria-label={p.label}
                className={cn(
                  "group relative flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition-all duration-300",
                  isActive
                    ? "scale-105 border-primary/40 bg-primary/5 shadow-lg shadow-primary/10"
                    : isDone
                      ? "border-border/60 bg-muted/40"
                      : "border-border/40 bg-card/40 opacity-70 hover:opacity-100",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg border transition-all",
                    isActive ? "border-primary/40 bg-background" : "border-border/50 bg-background/60",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 transition-colors",
                      isActive ? "text-primary" : isDone ? "text-foreground/70" : "text-muted-foreground",
                    )}
                  />
                </span>
                <span className={cn("text-[10px] leading-tight font-medium", isActive ? "text-foreground" : "text-muted-foreground")}>
                  {p.label}
                </span>
                <span className={cn("size-1.5 rounded-full transition-transform", style.dot, isActive && "animate-ping-slow")} />
                {/* flowing connector pip */}
                {isActive && (
                  <span className="absolute -inset-px rounded-xl ring-1 ring-primary/30 ring-offset-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* detail panel for the active phase */}
      <div className="mt-6 rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/5">
            <current.icon className="size-5 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">{current.label}</h3>
              <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", WORKER_STYLE[current.worker].chip)}>
                <span className={cn("size-1.5 rounded-full", WORKER_STYLE[current.worker].dot)} />
                {current.worker}
              </span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {String(active + 1).padStart(2, "0")} / {PHASES.length}
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{current.blurb}</p>
          </div>
        </div>
        {/* progress bar */}
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 via-violet-400 to-emerald-400 transition-all duration-500"
            style={{ width: `${((active + 1) / PHASES.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
