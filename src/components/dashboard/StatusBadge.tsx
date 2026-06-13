export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING_REVIEW: "bg-amber-100 text-amber-800",
    APPROVED: "bg-blue-100 text-blue-800",
    PUBLISHED: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-700",
    CHANGES_REQUESTED: "bg-purple-100 text-purple-800",
    REJECTED: "bg-gray-200 text-gray-600",
    DRAFTING: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.toLowerCase().replace(/_/g, " ")}
    </span>
  );
}
