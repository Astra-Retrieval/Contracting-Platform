import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, Flash, inputCls, type SearchParams } from "@/components/ui";

export const metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <div className="page max-w-md!">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Reset your password</h1>
      <p className="mb-6 text-sm text-stone-600">
        Enter the email you signed up with. We will send a link that lets you choose a new password.
      </p>
      <Flash params={params} />
      <Card>
        <form action={requestPasswordReset} className="space-y-4">
          <Field label="Email">
            <input name="email" type="email" required autoComplete="email" className={inputCls} />
          </Field>
          <SubmitButton className="w-full" pendingText="Sending…">
            Send reset link
          </SubmitButton>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-stone-600">
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
