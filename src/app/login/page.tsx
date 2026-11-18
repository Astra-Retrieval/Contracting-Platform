import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, Flash, inputCls, type SearchParams } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured) redirect("/setup");
  if (await getViewer()) redirect("/dashboard");
  const params = await searchParams;

  return (
    <div className="page max-w-md!">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Sign in</h1>
      <Flash params={params} />
      <Card>
        <form action={signIn} className="space-y-4">
          <Field label="Email">
            <input name="email" type="email" required autoComplete="email" className={inputCls} />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={inputCls}
            />
          </Field>
          <SubmitButton className="w-full" pendingText="Signing in…">
            Sign in
          </SubmitButton>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-stone-600">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
