import { redirect } from "next/navigation";

import { signInAction } from "./actions";
import { getAccount } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

export default async function Home() {
  const account = await getAccount();
  if (account) redirect("/projects");

  return (
    <main className="bg-muted/30 flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Rankenstein</h1>
          <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
            Autonomous, self-correcting content that publishes only after it proves itself. For site owners and agencies.
          </p>
        </div>
        <Card>
          <CardHeader><CardTitle>Sign in</CardTitle></CardHeader>
          <CardContent>
            <form action={signInAction} className="space-y-3">
              <div className="grid gap-1.5"><Label htmlFor="name">Name</Label><Input id="name" name="name" placeholder="Your name" /></div>
              <div className="grid gap-1.5"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" placeholder="you@company.com" required /></div>
              <Button type="submit" className="w-full">Continue</Button>
              <p className="text-muted-foreground text-xs">No password for the demo. Email creates your account.</p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
