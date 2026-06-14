"use client";

// Reusable client-side table pager, shadcn-styled (Button + chevrons). Used by
// the Content and Products tables. Shows "from-to of total" + Prev / numbered
// pages (with ellipses) / Next.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Compact page list: first, last, current +/-1, with ellipses for gaps. */
function pageList(page: number, pageCount: number): (number | "ellipsis")[] {
  const keep = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const sorted = [...keep].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) out.push("ellipsis");
    out.push(n);
    prev = n;
  }
  return out;
}

export function TablePager({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (n: number) => void;
}) {
  if (pageCount <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
      <span className="text-muted-foreground text-xs">
        {from}-{to} of {total}
      </span>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        {pageList(page, pageCount).map((n, i) =>
          n === "ellipsis" ? (
            <span key={`e${i}`} className="text-muted-foreground px-1.5 text-sm" aria-hidden>
              …
            </span>
          ) : (
            <Button
              key={n}
              variant={n === page ? "default" : "outline"}
              size="sm"
              className="min-w-8"
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPage(n)}
            >
              {n}
            </Button>
          ),
        )}
        <Button variant="outline" size="icon-sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </nav>
    </div>
  );
}
