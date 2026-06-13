import { redirect } from "next/navigation";

// The review queue lives in the dashboard now (sidebar → Review).
export default async function ReviewQueueRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/p/${slug}/review`);
}
