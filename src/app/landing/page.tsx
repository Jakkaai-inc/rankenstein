import { redirect } from "next/navigation";

// The landing page now lives at the root (/). Keep /landing as a permanent
// alias so any shared links still resolve.
export default function LandingAlias() {
  redirect("/");
}
