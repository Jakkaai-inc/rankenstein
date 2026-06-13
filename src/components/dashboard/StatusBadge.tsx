import { Badge } from "@/components/ui/badge";

type V = React.ComponentProps<typeof Badge>["variant"];

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, V> = {
    PENDING_REVIEW: "warning",
    APPROVED: "info",
    PUBLISHED: "success",
    FAILED: "destructive",
    CHANGES_REQUESTED: "warning",
    REJECTED: "secondary",
    DRAFTING: "secondary",
  };
  return <Badge variant={map[status] ?? "secondary"}>{status.toLowerCase().replace(/_/g, " ")}</Badge>;
}
