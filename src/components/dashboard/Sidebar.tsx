"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  projectId: string;
  counts: { products: number; pending: number; published: number };
}

export default function Sidebar({ projectId, counts }: Props) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const items = [
    { href: base, label: "Overview", icon: "▦", exact: true },
    { href: `${base}/products`, label: "Products", icon: "▤", badge: counts.products || undefined },
    { href: `${base}/content`, label: "Content", icon: "✎", badge: counts.pending || undefined },
    { href: `${base}/settings`, label: "Settings", icon: "⚙" },
  ];

  return (
    <nav className="flex w-52 shrink-0 flex-col gap-1 border-r bg-white p-3">
      {items.map((it) => {
        const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
              active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="opacity-70">{it.icon}</span>
              {it.label}
            </span>
            {it.badge != null && (
              <span className={`rounded-full px-1.5 text-xs ${active ? "bg-white/20" : "bg-gray-200 text-gray-600"}`}>{it.badge}</span>
            )}
          </Link>
        );
      })}
      <Link href="/projects" className="mt-2 px-3 py-2 text-xs text-gray-400 hover:text-gray-600">← all projects</Link>
    </nav>
  );
}
