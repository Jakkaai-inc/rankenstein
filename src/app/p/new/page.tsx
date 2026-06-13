import { redirect } from "next/navigation";

import { getAccount } from "@/lib/session";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export const dynamic = "force-dynamic";

// Project-creation wizard (Onboarding lane). Guards auth, then hands off to the
// client wizard which drives create -> crawl -> confirm -> demo pre-connect.
export default async function NewProjectPage() {
  const account = await getAccount();
  if (!account) redirect("/login");
  return (
    <main className="min-h-svh px-4 py-10 sm:py-16">
      <OnboardingWizard />
    </main>
  );
}
