import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Search,
  GitPullRequestArrow,
  Store,
  Users,
  Bot,
  FileCheck2,
  Workflow,
  Brain,
  Heart,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NeuralBackground } from "@/components/landing/NeuralBackground";
import { PipelineFlow } from "@/components/landing/PipelineFlow";
import { ClientShowcase } from "@/components/landing/ClientShowcase";
import { getAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rankenstein — content that proves itself before it ships",
  description:
    "An autonomous, self-correcting content engine. Real keyword research, grounded claims, AEO structure, and an independent verifier. Nothing publishes without human approval.",
};

const FEATURES = [
  {
    icon: Search,
    title: "Keyword research that picks fights it can win",
    body: "Raw candidates from the web or Ahrefs, then a deterministic filter and a SERP-ownership verdict against your real site authority. Winnable, stretch, or no.",
  },
  {
    icon: ShieldCheck,
    title: "Never invents a fact",
    body: "Every claim traces to a FactsTable built from your live store data. Missing a spec? It flags it. Refuse-and-flag always beats degrade-and-guess.",
  },
  {
    icon: Sparkles,
    title: "Built for answer engines, not just Google",
    body: "AEO structure (3-sentence test, extractability, one-paragraph test) plus clean JSON-LD so LLMs can extract and cite you, not just rank you.",
  },
  {
    icon: Bot,
    title: "Agents only where judgment lives",
    body: "Filters, gates, and diffs are plain deterministic code. Fast and strong agents handle research, drafting, and grading. The right tool for each layer.",
  },
  {
    icon: FileCheck2,
    title: "An independent verifier grades every piece",
    body: "A fresh-context agent scores each piece against the rubric. Two failures and the piece self-flags for human triage. Quality is gated, not hoped for.",
  },
  {
    icon: GitPullRequestArrow,
    title: "Surgical, reviewable, reversible",
    body: "Anchored comments drive an edit that touches only what you flagged, proven by a span diff. Publish to Shopify with a snapshot and one-click rollback.",
  },
];

const AUDIENCE = [
  {
    icon: Store,
    title: "Site owners",
    tag: "Self-serve",
    body: "Connect your store, configure once, review by email. The engine does keyword research, drafting, and grading. You approve. It publishes.",
  },
  {
    icon: Users,
    title: "Agencies",
    tag: "The trust layer",
    body: "Run many client projects and review at scale. Every piece arrives with its grade, its citations, and its guardrail flags already attached.",
  },
  {
    icon: Workflow,
    title: "Whole-catalog runs",
    tag: "At scale",
    body: "Process an entire catalog priority-ordered, with per-piece token ceilings and automatic triage. Built to finish inside a real budget.",
  },
];

export default async function LandingPage() {
  const account = await getAccount();
  if (account) redirect("/projects");

  return (
    <main className="relative flex min-h-screen flex-col overflow-x-hidden bg-background">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-lg">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white">
              <Brain className="size-4" />
            </span>
            Rankenstein
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#who" className="hover:text-foreground">Who it's for</a>
            <a href="#clients" className="hover:text-foreground">Clients</a>
          </nav>
          <Button asChild size="sm">
            <Link href="/login">Get started <ArrowRight className="size-4" /></Link>
          </Button>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative isolate flex min-h-[88vh] items-center overflow-hidden border-b border-border/40">
        <NeuralBackground />
        {/* aurora glows */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="animate-aurora absolute left-1/4 top-1/4 size-[40rem] rounded-full bg-sky-500/10 blur-[120px]" />
          <div className="animate-aurora absolute right-1/4 bottom-0 size-[36rem] rounded-full bg-violet-500/10 blur-[120px] [animation-delay:-9s]" />
        </div>

        <div className="mx-auto w-full max-w-4xl px-5 py-24 text-center">
          <Badge variant="outline" className="mb-6 inline-flex h-7 gap-1.5 border-primary/30 bg-primary/5 px-3 text-xs">
            <Sparkles className="size-3.5 text-primary" />
            Built on the Claude Fable 5 Build Day
          </Badge>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">
            Content that{" "}
            <span className="text-gradient-ai">proves itself</span>
            <br className="hidden sm:block" /> before it ships.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Rankenstein is an autonomous, self-correcting content engine. It researches
            keywords it can actually win, grounds every claim in your real data, structures
            for search and answer engines, and lets an independent verifier grade each piece.
            Nothing publishes without your approval.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-6 text-base">
              <Link href="/login">Get started <ArrowRight className="size-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
              <a href="#how">See the pipeline</a>
            </Button>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4 text-emerald-500" /> Never invents facts</span>
            <span className="inline-flex items-center gap-1.5"><FileCheck2 className="size-4 text-emerald-500" /> Verifier-gated</span>
            <span className="inline-flex items-center gap-1.5"><GitPullRequestArrow className="size-4 text-emerald-500" /> Human-approved publish</span>
          </div>
        </div>
      </section>

      {/* ── How it works / pipeline ─────────────────────────────────────── */}
      <section id="how" className="border-b border-border/40 py-20">
        <div className="mx-auto w-full max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="secondary" className="mb-4">The pipeline</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Every piece runs the same gauntlet
            </h2>
            <p className="mt-4 text-muted-foreground">
              One workflow per piece. Deterministic code where rules belong, agents where
              judgment lives, and an independent grader at the end. Click any phase to inspect it.
            </p>
          </div>
          <div className="mt-12">
            <PipelineFlow />
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section id="features" className="border-b border-border/40 py-20">
        <div className="mx-auto w-full max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="secondary" className="mb-4">What makes it different</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Most AI content tools spin generic fluff
            </h2>
            <p className="mt-4 text-muted-foreground">
              No real research, no grounding, invented facts, no accountability loop.
              Rankenstein fixes all four, and proves it on every run.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group rounded-2xl border border-border/60 bg-card/50 p-6 transition-all hover:border-primary/40 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <span className="flex size-11 items-center justify-center rounded-xl border border-border/60 bg-background transition-colors group-hover:border-primary/40">
                    <Icon className="size-5 text-primary" />
                  </span>
                  <h3 className="mt-4 font-semibold leading-snug">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Who it's for ────────────────────────────────────────────────── */}
      <section id="who" className="border-b border-border/40 py-20">
        <div className="mx-auto w-full max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="secondary" className="mb-4">Who it's for</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Owners who want it done. Agencies who answer for it.
            </h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {AUDIENCE.map((a) => {
              const Icon = a.icon;
              return (
                <div key={a.title} className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex size-11 items-center justify-center rounded-xl border border-border/60 bg-background">
                      <Icon className="size-5 text-primary" />
                    </span>
                    <Badge variant="outline" className="border-primary/30 text-primary">{a.tag}</Badge>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{a.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Client examples ─────────────────────────────────────────────── */}
      <section id="clients" className="border-b border-border/40 py-20">
        <div className="mx-auto w-full max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="secondary" className="mb-4">Real clients, today</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Two live stores, two pipelines
            </h2>
            <p className="mt-4 text-muted-foreground">
              Toggle before and after to see what the engine actually changes, and why every
              word is defensible.
            </p>
          </div>
          <div className="mt-12">
            <ClientShowcase />
          </div>
        </div>
      </section>

      {/* ── Thank you to Anthropic ──────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border/40 py-20">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="animate-aurora absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/10 blur-[120px]" />
        </div>
        <div className="mx-auto w-full max-w-2xl px-5 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/10">
            <Heart className="size-6 text-rose-500" />
          </span>
          <h2 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">
            Thank you, Anthropic team
          </h2>
          <p className="mx-auto mt-4 text-pretty leading-relaxed text-muted-foreground">
            Rankenstein was built in a single day for the Claude Fable 5 Build Day. Thank you
            for the invitation, for the models that made an honest, self-correcting engine
            possible, and for setting the bar at content that has to prove itself. It was a
            genuine joy to build alongside Claude.
          </p>
          <p className="mt-4 text-sm font-medium text-foreground">
            With gratitude, from the Rankenstein build.
          </p>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto w-full max-w-3xl px-5 text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl">
            Ready to ship content you can{" "}
            <span className="text-gradient-ai">stand behind?</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-muted-foreground">
            Connect a store, confirm your brand voice, and let the engine prove every piece
            before it ever reaches your inbox.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-7 text-base">
              <Link href="/login">Get started <ArrowRight className="size-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/40 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-5 text-sm text-muted-foreground sm:flex-row">
          <span className="inline-flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-violet-600 text-white">
              <Brain className="size-3.5" />
            </span>
            Rankenstein
          </span>
          <span>Built on the Claude Fable 5 Build Day, 2026.</span>
          <Link href="/login" className="hover:text-foreground">Sign in</Link>
        </div>
      </footer>
    </main>
  );
}
