import { redirect } from "next/navigation";

import { signInAction } from "./actions";
import { getAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const account = await getAccount();
  if (account) redirect("/projects");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Rankenstein</h1>
        <p className="mt-2 text-sm text-gray-500">
          Autonomous, self-correcting content that publishes only after it proves itself. For site owners and agencies.
        </p>
      </div>
      <form action={signInAction} className="space-y-3 rounded-xl border p-5">
        <h2 className="font-semibold">Sign in</h2>
        <input name="name" placeholder="Your name" className="w-full rounded border p-2" />
        <input name="email" type="email" placeholder="you@company.com" className="w-full rounded border p-2" required />
        <button className="w-full rounded bg-black px-4 py-2 text-white">Continue</button>
        <p className="text-xs text-gray-400">No password for the demo. Email creates your account.</p>
      </form>
    </main>
  );
}
