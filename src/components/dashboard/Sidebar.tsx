"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, FileText, Settings, ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  slug: string;
  counts: { products: number; pending: number; published: number };
}

export default function Sidebar({ slug, counts }: Props) {
  const pathname = usePathname();
  const base = `/p/${slug}`;
  const items = [
    { href: `${base}/overview`, label: "Overview", Icon: LayoutDashboard },
    { href: `${base}/products`, label: "Products", Icon: Package, badge: counts.products || undefined },
    { href: `${base}/articles`, label: "Articles", Icon: FileText, badge: counts.pending || undefined },
    { href: `${base}/settings`, label: "Settings", Icon: Settings },
  ];

  return (
    <nav className="bg-sidebar text-sidebar-foreground flex w-56 shrink-0 flex-col gap-1 border-r p-3">
      {items.map(({ href, label, Icon, badge }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <span className="flex items-center gap-2.5">
              <Icon className="size-4" />
              {label}
            </span>
            {badge != null && (
              <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-muted text-muted-foreground")}>{badge}</span>
            )}
          </Link>
        );
      })}
      <Link href="/p" className="text-muted-foreground hover:text-foreground mt-2 flex items-center gap-2 px-3 py-2 text-xs">
        <ArrowLeft className="size-3" /> All projects
      </Link>
    </nav>
  );
}
