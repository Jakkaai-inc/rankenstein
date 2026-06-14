"use client";

import { useFormStatus } from "react-dom";
import { CalendarDays, Sparkles, X } from "lucide-react";

import { generatePlannedArticle, removePlannedArticle } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface PlannedArticle {
  id: string;
  title: string;
  primaryKeyword: string | null;
  scheduledFor: string | null;
  rationale: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ContentCalendar({ planned }: { planned: PlannedArticle[] }) {
  if (planned.length === 0) return null;
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
        <CalendarDays className="text-primary size-4" />
        <h2 className="font-semibold">Content calendar</h2>
        <Badge variant="secondary" className="ml-1">{planned.length} planned</Badge>
        <span className="text-muted-foreground ml-auto text-xs">Draft now runs the full engine: research → ground → draft → verify</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Target</TableHead>
            <TableHead>Article</TableHead>
            <TableHead>Primary keyword</TableHead>
            <TableHead className="w-px text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {planned.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{fmtDate(p.scheduledFor)}</TableCell>
              <TableCell>
                <div className="font-medium whitespace-normal">{p.title}</div>
                {p.rationale && <div className="text-muted-foreground text-xs whitespace-normal">{p.rationale}</div>}
              </TableCell>
              <TableCell className="text-muted-foreground">{p.primaryKeyword ?? "—"}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <form action={generatePlannedArticle}>
                    <input type="hidden" name="itemId" value={p.id} />
                    <DraftButton />
                  </form>
                  <form action={removePlannedArticle}>
                    <input type="hidden" name="itemId" value={p.id} />
                    <Button type="submit" variant="ghost" size="icon-sm" title="Remove from calendar"><X className="size-4" /></Button>
                  </form>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function DraftButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Sparkles className="size-3.5" /> {pending ? "Drafting… ~1 min" : "Draft now"}
    </Button>
  );
}
