"use client";

import { useFormStatus } from "react-dom";
import { CalendarPlus, Loader2 } from "lucide-react";

import { planContentCalendar } from "@/app/actions";
import { Button } from "@/components/ui/button";

export default function PlanCalendarForm({ projectId, label, count = 8 }: { projectId: string; label: string; count?: number }) {
  return (
    <form action={planContentCalendar}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="goals" value="create_articles" />
      <input type="hidden" name="count" value={String(count)} />
      <Submit label={label} />
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <><Loader2 className="size-4 animate-spin" /> Planning your calendar…</> : <><CalendarPlus className="size-4" /> {label}</>}
    </Button>
  );
}
