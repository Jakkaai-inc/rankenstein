"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface SwitcherProject {
  slug: string;
  name: string;
  siteUrl: string;
  connected: boolean;
}

const SECTIONS = ["overview", "products", "articles", "settings"];

export default function ProjectSwitcher({ projects, currentSlug }: { projects: SwitcherProject[]; currentSlug: string }) {
  const pathname = usePathname();
  const router = useRouter();

  // keep the active section when switching projects (/p/[slug]/<section>)
  const seg = pathname.split("/")[3];
  const section = SECTIONS.includes(seg) ? seg : "overview";
  const current = projects.find((p) => p.slug === currentSlug);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 max-w-[220px] justify-between gap-2 font-normal">
          <span className="truncate">{current?.name ?? currentSlug}</span>
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[260px]">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        {projects.map((p) => (
          <DropdownMenuItem key={p.slug} onSelect={() => router.push(`/p/${p.slug}/${section}`)} className="gap-2">
            <span className={cn("size-1.5 shrink-0 rounded-full", p.connected ? "bg-emerald-500" : "bg-muted-foreground/30")} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{p.name}</span>
              <span className="text-muted-foreground block truncate text-xs">{p.siteUrl}</span>
            </span>
            {p.slug === currentSlug && <Check className="size-4 shrink-0" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/p/new" className="gap-2">
            <Plus className="size-4" /> New project
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
