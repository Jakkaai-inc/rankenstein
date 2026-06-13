import { redirect } from "next/navigation";

// Moved to /p (studio). Keep this as a permanent redirect for old links/bookmarks.
export default function ProjectsRedirect() {
  redirect("/p");
}
