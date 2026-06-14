import { ShieldCheck, Info } from "lucide-react";

import type { DerivedChecklist, ChecklistItem } from "@/lib/run/checklist";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function ItemRow({ item }: { item: ChecklistItem }) {
  const required = item.tier === "required";
  return (
    <li className="flex items-start gap-3 py-2">
      {required ? (
        <ShieldCheck className="text-foreground/70 mt-0.5 size-4 shrink-0" />
      ) : (
        <Info className="text-muted-foreground/60 mt-0.5 size-4 shrink-0" />
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{item.label}</span>
          <Badge variant={required ? "secondary" : "outline"} className="text-[10px] uppercase tracking-wide">
            {required ? "required" : "advisory"}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">{item.requirement}</p>
      </div>
    </li>
  );
}

export default function QualificationChecklist({ checklist }: { checklist: DerivedChecklist }) {
  const { groups, summary } = checklist;
  return (
    <div className="space-y-4">
      <div className="text-muted-foreground text-sm">
        Every piece must pass{" "}
        <span className="text-foreground font-semibold">{summary.required} required</span> check
        {summary.required === 1 ? "" : "s"} to become a publish candidate
        {summary.advisory > 0 && (
          <>
            {" "}
            (plus <span className="text-foreground font-semibold">{summary.advisory}</span> advisory, surfaced but not blocking)
          </>
        )}
        . This rubric is derived from the run config below — it is what the engine hillclimbs each run.
      </div>

      {groups.map((g) => (
        <Card key={g.key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{g.title}</CardTitle>
            <CardDescription>{g.blurb}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-border/60 divide-y">
              {g.items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
