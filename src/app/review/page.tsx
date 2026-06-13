import { redirect } from "next/navigation";

// Global review queue moved to per-project /r/[slug]. Redirect to projects.
export default function ReviewRedirect() {
  redirect("/p");
}
