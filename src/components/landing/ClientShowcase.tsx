"use client";

import { useState } from "react";
import { ArrowRight, ExternalLink, ScrollText, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Client = {
  name: string;
  domain: string;
  url: string;
  kind: "Product rewrites" | "SEO articles";
  icon: typeof Package;
  accent: string;
  pitch: string;
  before: string;
  after: string;
  wins: string[];
};

const CLIENTS: Client[] = [
  {
    name: "EZ Fabric",
    domain: "ezfabricinc.com",
    url: "https://ezfabricinc.com",
    kind: "Product rewrites",
    icon: Package,
    accent: "from-sky-500/20 to-violet-500/20",
    pitch:
      "A DTLA Shopify fabric wholesaler. Rankenstein rewrites the full catalog, product by product, grounding every spec in the live store data.",
    before:
      "Minky Solid Cuddle 3 - soft fabric, great for blankets. 60 inch wide. Buy now.",
    after:
      "Soft 3mm-pile minky in a 60 inch cut-to-order width, suited to baby blankets and plush backings. Spec table, who-it's-for framing, FAQ, and Product JSON-LD, every claim traced to the catalog.",
    wins: ["Grounded spec table", "Variant keyword map", "No invented dimensions"],
  },
  {
    name: "Sweet Angeles",
    domain: "sweetangeles.com",
    url: "https://sweetangeles.com",
    kind: "SEO articles",
    icon: ScrollText,
    accent: "from-violet-500/20 to-emerald-500/20",
    pitch:
      "A lifestyle brand. Rankenstein researches winnable keywords, drafts answer-engine-ready articles, and verifies every external citation before a human ever sees it.",
    before:
      "Generic 800-word post stuffed with a head term the site can never rank for, two made-up statistics, zero citations.",
    after:
      "An angle chosen from a winnable SERP, an adversarially-critiqued outline, inline-cited claims that each load and check out, plus Article + FAQPage JSON-LD.",
    wins: ["SERP-ownership keyword pick", "Citation-verified claims", "AEO extractability pass"],
  },
];

export function ClientShowcase() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {CLIENTS.map((c) => (
        <ClientCard key={c.domain} client={c} />
      ))}
    </div>
  );
}

function ClientCard({ client }: { client: Client }) {
  const [showAfter, setShowAfter] = useState(true);
  const Icon = client.icon;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm transition-all hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5">
      <div className={cn("pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-gradient-to-br blur-2xl opacity-60", client.accent)} />

      <div className="relative">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-background">
            <Icon className="size-5 text-primary" />
          </span>
          <div>
            <h3 className="font-semibold leading-tight">{client.name}</h3>
            <a
              href={client.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              {client.domain}
              <ExternalLink className="size-3" />
            </a>
          </div>
          <Badge variant="secondary" className="ml-auto">{client.kind}</Badge>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{client.pitch}</p>

        {/* before / after toggle */}
        <div className="mt-5">
          <div className="mb-2 inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs">
            <button
              onClick={() => setShowAfter(false)}
              className={cn("rounded-md px-3 py-1 font-medium transition-colors", !showAfter ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
            >
              Before
            </button>
            <button
              onClick={() => setShowAfter(true)}
              className={cn("rounded-md px-3 py-1 font-medium transition-colors", showAfter ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
            >
              After Rankenstein
            </button>
          </div>
          <div
            key={showAfter ? "after" : "before"}
            className={cn(
              "animate-float-up rounded-xl border p-3.5 text-sm leading-relaxed",
              showAfter
                ? "border-emerald-400/40 bg-emerald-500/5 text-foreground"
                : "border-border/60 bg-muted/30 text-muted-foreground",
            )}
          >
            {showAfter ? client.after : client.before}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {client.wins.map((w) => (
            <span key={w} className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              <ArrowRight className="size-3" />
              {w}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
