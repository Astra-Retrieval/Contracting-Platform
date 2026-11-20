import { setNewPassword } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, Flash, inputCls, type SearchParams } from "@/components/ui";
import { requireViewer } from "@/lib/auth";

export const metadata = { title: "Choose a new password" };

// Reached from the reset link, which signs the person in first.
export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer();
  const params = await searchParams;
  return (
    <div className="page max-w-md!">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mb-6 text-sm text-stone-600">For {viewer.email}.</p>
      <Flash params={params} />
      <Card>
        <form action={setNewPassword} className="space-y-4">
          <Field label="New password" hint="At least 8 characters.">
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputCls}
            />
          </Field>
          <SubmitButton className="w-full" pendingText="Saving…">
            Save new password
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
