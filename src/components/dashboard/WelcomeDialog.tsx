"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { FileText, PencilLine, Package, Check, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { planContentCalendar } from "@/app/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const OPTIONS = [
  { key: "create_articles", label: "Create articles", desc: "Plan a content calendar of new, grounded blog articles.", Icon: FileText },
  { key: "edit_articles", label: "Edit existing articles", desc: "Refresh and improve articles you already have.", Icon: PencilLine },
  { key: "improve_products", label: "Improve product content", desc: "Rewrite product descriptions, grounded in real facts.", Icon: Package },
] as const;

export default function WelcomeDialog({ projectId, brandConfirmed }: { projectId: string; brandConfirmed: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(["create_articles"]);

  const dismissKey = `rk_welcome_${projectId}`;
  useEffect(() => {
    if (typeof window !== "undefined" && !window.localStorage.getItem(dismissKey)) setOpen(true);
  }, [dismissKey]);

  function close() {
    if (typeof window !== "undefined") window.localStorage.setItem(dismissKey, "1");
    setOpen(false);
  }
  function toggle(key: string) {
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-xl" showClose>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="text-primary size-5" /> Let&apos;s set up your content</DialogTitle>
          <DialogDescription>Pick what you want Rankenstein to work on. We&apos;ll build a content calendar to match.</DialogDescription>
        </DialogHeader>

        <form action={planContentCalendar} onSubmit={() => { if (typeof window !== "undefined") window.localStorage.setItem(dismissKey, "1"); }}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="goals" value={selected.join(",")} />
          <input type="hidden" name="count" value="8" />

          <div className="grid gap-2.5">
            {OPTIONS.map(({ key, label, desc, Icon }) => {
              const on = selected.includes(key);
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => toggle(key)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    on ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                  )}
                >
                  <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    <Icon className="size-4" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="text-muted-foreground block text-xs">{desc}</span>
                  </span>
                  <span className={cn("mt-1 flex size-4 items-center justify-center rounded-full border", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                    {on && <Check className="size-3" />}
                  </span>
                </button>
              );
            })}
          </div>

          {selected.includes("create_articles") && !brandConfirmed && (
            <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
              Confirm your brand profile in Settings first — the calendar is built from your brand&apos;s seed topics.
            </p>
          )}

          <DialogFooter className="mt-5">
            <Button type="button" variant="ghost" onClick={close}>Skip for now</Button>
            <Submit disabled={selected.length === 0} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Building your calendar…" : "Build my plan"}
    </Button>
  );
}
