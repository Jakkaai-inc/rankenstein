"use client";

import { useFormStatus } from "react-dom";
import { CalendarDays, Sparkles, X } from "lucide-react";

import { generatePlannedArticle, removePlannedArticle } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface PlannedArticle {
  id: string;
  title: string;
  primaryKeyword: string | null;
  scheduledFor: string | null;
  rationale: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "unscheduled";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ContentCalendar({ planned }: { planned: PlannedArticle[] }) {
  if (planned.length === 0) return null;
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <CalendarDays className="text-primary size-4" />
        <h2 className="font-semibold">Content calendar</h2>
        <Badge variant="secondary" className="ml-1">{planned.length} planned</Badge>
        <span className="text-muted-foreground ml-auto text-xs">Generate runs the full engine (research → ground → draft → verify)</span>
      </div>
      <ul className="divide-y">
        {planned.map((p) => (
          <li key={p.id} className="flex items-center gap-4 px-5 py-3">
            <div className="w-14 shrink-0 text-center">
              <div className="text-muted-foreground text-[10px] uppercase">{fmtDate(p.scheduledFor)}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{p.title}</div>
              <div className="text-muted-foreground truncate text-xs">
                {p.primaryKeyword}{p.rationale ? ` · ${p.rationale}` : ""}
              </div>
            </div>
            <Badge variant="outline" className="shrink-0">planned</Badge>
            <form action={generatePlannedArticle}>
              <input type="hidden" name="itemId" value={p.id} />
              <GenerateButton />
            </form>
            <form action={removePlannedArticle}>
              <input type="hidden" name="itemId" value={p.id} />
              <Button type="submit" variant="ghost" size="icon-sm" title="Remove from calendar"><X className="size-4" /></Button>
            </form>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function GenerateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Sparkles className="size-3.5" /> {pending ? "Generating…" : "Generate"}
    </Button>
  );
}
