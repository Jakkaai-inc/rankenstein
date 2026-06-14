"use client";

// 3-step project-creation wizard. Step 1 creates the project + crawls the site
// (with a chain-of-thoughts animation on the button); step 2 shows + confirms the
// extracted brand (the gate that unlocks generation); step 3 pre-connects the
// demo Shopify store. Reuses the /api/v1 routes + the preconnect server action;
// no engine/contract changes.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Globe, Loader2, Sparkles, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Stepper, type StepDef } from "./Stepper";
import { createAndDraft, confirmBrandStep, preconnectDemoStore, type PreconnectResult, type BrandFields } from "@/app/p/new/actions";

const STEPS: StepDef[] = [
  { key: "site", label: "Your website" },
  { key: "brand", label: "Brand" },
  { key: "store", label: "Shopify" },
];

const THOUGHTS = (host: string) => [
  `Reaching ${host}`,
  "Reading the homepage",
  "Looking for an About page",
  "Extracting brand voice and audience",
  "Spotting products and topics buyers search",
  "Drafting your brand profile",
];

function hostOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // step 1
  const [siteUrl, setSiteUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [thoughts, setThoughts] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // result of step 1
  const [projectId, setProjectId] = useState<string | null>(null);
  const [accessible, setAccessible] = useState(false);

  // step 2 (editable brand)
  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState("");
  const [audience, setAudience] = useState("");
  const [voice, setVoice] = useState("");
  const [brandFacts, setBrandFacts] = useState("");
  const [seedInput, setSeedInput] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [confirming, setConfirming] = useState(false);

  // step 3
  const [preconnect, setPreconnect] = useState<PreconnectResult | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const host = siteUrl ? hostOf(siteUrl) : "your site";
  const seedTopics = seedInput.split(",").map((s) => s.trim()).filter(Boolean);

  function applyDraft(b: BrandFields, isAccessible: boolean) {
    setBrandName(b.brandName ?? "");
    setIndustry(b.industry ?? "");
    setAudience(b.audience ?? "");
    setVoice(b.voice ?? "");
    setBrandFacts(b.brandFacts ?? "");
    setSeedInput((b.seedTopics ?? []).join(", "));
    setCompetitors((b.competitors ?? []).join(", "));
    setAccessible(isAccessible);
  }

  async function startFetch() {
    if (!siteUrl.trim()) { setErr("Enter your website URL"); return; }
    setErr(null);
    setRunning(true);
    setThoughts([]);
    const lines = THOUGHTS(host);
    let i = 0;
    timer.current = setInterval(() => {
      i += 1;
      setThoughts(lines.slice(0, Math.min(i, lines.length)));
    }, 850);
    setThoughts([lines[0]]);

    try {
      const r = await createAndDraft(siteUrl.trim());
      if (timer.current) clearInterval(timer.current);
      if (!r.ok) { setRunning(false); setErr(r.error); return; }
      setProjectId(r.projectId);
      applyDraft(r.brand, r.accessible);
      setThoughts(lines);
      setRunning(false);
      setStep(1);
    } catch (e) {
      if (timer.current) clearInterval(timer.current);
      setRunning(false);
      setErr(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  async function confirmBrand() {
    if (!projectId) return;
    if (seedTopics.length === 0) { setErr("Add at least one seed topic - research starts from these"); return; }
    setErr(null);
    setConfirming(true);
    try {
      const r = await confirmBrandStep(projectId, {
        brandName, industry, audience, voice, brandFacts,
        seedTopics,
        competitors: competitors.split(",").map((s) => s.trim()).filter(Boolean),
      });
      if (!r.ok) { setConfirming(false); setErr(r.error); return; }
      setConfirming(false);
      setStep(2);
      // kick off the demo pre-connect as we land on step 3
      const pr = await preconnectDemoStore(projectId);
      setPreconnect(pr);
    } catch (e) {
      setConfirming(false);
      setErr(e instanceof Error ? e.message : "Could not confirm the brand");
    }
  }

  function finish() {
    const slug = preconnect?.slug;
    router.push(slug ? `/p/${slug}/overview` : "/p");
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-8"><Stepper steps={STEPS} current={step} /></div>

      {/* STEP 1 - website */}
      {step === 0 && (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Let&apos;s find your brand</h1>
            <p className="text-muted-foreground text-sm">Enter your website and we&apos;ll read it to draft your brand profile. Nothing is invented - if we can&apos;t read it, you&apos;ll fill it in yourself.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="siteUrl">Website URL</Label>
            <div className="relative">
              <Globe className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                id="siteUrl" inputMode="url" autoFocus placeholder="ezfabricinc.com"
                className="pl-9" value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !running) startFetch(); }}
                disabled={running}
              />
            </div>
          </div>

          {running && (
            <ul className="bg-muted/40 space-y-2 rounded-xl border p-4">
              {thoughts.map((t, i) => {
                const last = i === thoughts.length - 1;
                return (
                  <li key={t} className="flex items-center gap-2 text-sm">
                    {last ? <Loader2 className="text-primary size-4 animate-spin" /> : <Check className="size-4 text-emerald-600" />}
                    <span className={last ? "text-foreground" : "text-muted-foreground"}>{t}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {err && <p className="text-destructive text-sm">{err}</p>}

          <Button onClick={startFetch} disabled={running} size="lg" className="w-full">
            {running ? <><Loader2 className="size-4 animate-spin" /> Reading your site</> : <>Next <ArrowRight className="size-4" /></>}
          </Button>
        </div>
      )}

      {/* STEP 2 - brand */}
      {step === 1 && (
        <div className="space-y-5">
          <div className={`flex items-start gap-3 rounded-xl border p-4 ${accessible ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/10"}`}>
            {accessible
              ? <Check className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />}
            <div>
              <p className="font-medium">{accessible ? `Your website is accessible` : `We couldn't read ${host} automatically`}</p>
              <p className="text-muted-foreground text-sm">{accessible ? `Here's the brand we drafted from ${host}. Edit anything, then confirm.` : `Add your brand details below, then confirm. We never invent a brand for you.`}</p>
            </div>
          </div>

          <div className="grid gap-4">
            <Field label="Brand name"><Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="EZ Fabric" /></Field>
            <Field label="Industry"><Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="fabric & sewing supplies" /></Field>
            <Field label="Audience"><Textarea rows={2} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Who they sell to" /></Field>
            <Field label="Brand voice"><Textarea rows={3} value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="Tone & personality for the writer" /></Field>
            <Field label="Brand facts (grounded, citable)"><Textarea rows={3} value={brandFacts} onChange={(e) => setBrandFacts(e.target.value)} placeholder="Location, materials, certifications - markdown bullets" /></Field>
            <Field label="Seed topics (comma separated, at least one)">
              <Input value={seedInput} onChange={(e) => setSeedInput(e.target.value)} placeholder="minky fabric, baby blankets, quilting cotton" />
              {seedTopics.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {seedTopics.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                </div>
              )}
            </Field>
            <Field label="Competitors (optional)"><Input value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="comma separated" /></Field>
          </div>

          {err && <p className="text-destructive text-sm">{err}</p>}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => { setStep(0); setErr(null); }}>Back</Button>
            <Button onClick={confirmBrand} disabled={confirming} size="lg">
              {confirming ? <><Loader2 className="size-4 animate-spin" /> Confirming</> : <>Looks right - confirm &amp; continue <ArrowRight className="size-4" /></>}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3 - shopify (demo pre-connect) */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Connect your store</h1>
            <p className="text-muted-foreground text-sm">Rankenstein publishes approved content to your Shopify store.</p>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Pre-connected for demo day</p>
              <p className="text-muted-foreground">Shopify requires an app-review flow before we can publish to a live customer store. For the demo we&apos;ve pre-connected a real Shopify store (900 products, 0 articles) - Rankenstein will refresh product content or write new articles there, with your approval before anything goes live.</p>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            {preconnect == null ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Connecting the demo store</p>
            ) : preconnect.connected ? (
              <p className="flex items-center gap-2 text-sm"><Store className="size-4 text-emerald-600" /> Connected: <span className="font-medium">{preconnect.shop}</span></p>
            ) : (
              <p className="text-muted-foreground flex items-start gap-2 text-sm"><Store className="mt-0.5 size-4" /> {preconnect.note}</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5 text-sm"><Sparkles className="size-4" /> Brand confirmed - generation unlocked</span>
            <Button onClick={finish} size="lg">Go to dashboard <ArrowRight className="size-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
