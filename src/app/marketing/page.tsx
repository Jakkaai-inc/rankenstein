import Link from "next/link";
import { ShieldCheck, Sparkles, GitCompareArrows, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-static";

const APP = process.env.NEXT_PUBLIC_APP_URL ?? "https://studio.rankenstein.app";

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">{icon}</div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-muted-foreground text-sm">{body}</p>
      </CardContent>
    </Card>
  );
}

export default function Marketing() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-lg font-bold tracking-tight">Rankenstein</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild><a href={`${APP}/login`}>Sign in</a></Button>
          <Button asChild><a href={`${APP}/login`}>Get started</a></Button>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <div className="bg-muted text-muted-foreground mx-auto mb-5 w-fit rounded-full px-3 py-1 text-xs font-medium">
          Grounded content that proves itself before it ships
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Autonomous, self-correcting content for your store.
        </h1>
        <p className="text-muted-foreground mx-auto mt-5 max-w-xl text-lg">
          Rankenstein researches your catalog, rewrites product pages and articles grounded in real facts, and publishes only after an independent verifier and a human approve. No invented claims. One-click rollback.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button size="lg" asChild><a href={`${APP}/login`}>Start free <Rocket className="size-4" /></a></Button>
          <Button size="lg" variant="outline" asChild><a href="#how">How it works</a></Button>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">For Shopify site owners and agencies.</p>
      </section>

      <section id="how" className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Feature icon={<Sparkles className="size-5" />} title="Research-first" body="Keyword research with SERP-ownership scoring picks topics you can actually win." />
          <Feature icon={<ShieldCheck className="size-5" />} title="Grounded, never invented" body="Every claim is checked against your real product facts. Ungrounded copy is flagged, not shipped." />
          <Feature icon={<GitCompareArrows className="size-5" />} title="Surgical review" body="Comment on a span and only that span is rewritten — an independent diff proves nothing else moved." />
          <Feature icon={<Rocket className="size-5" />} title="Publish + rollback" body="Approve, push live to your storefront, and roll back to the pre-publish snapshot in one click." />
        </div>
      </section>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-5xl items-center justify-between px-6 py-6 text-sm">
          <span>© Rankenstein</span>
          <Link href={`${APP}/login`} className="hover:text-foreground">Open the studio →</Link>
        </div>
      </footer>
    </div>
  );
}
