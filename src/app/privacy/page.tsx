import { APP_NAME } from "@/lib/config";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <div className="page page-narrow">
      <h1 className="text-2xl font-bold tracking-tight">Privacy policy</h1>
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Placeholder. Replace this page with a privacy policy before {APP_NAME} launches. It should
        describe what account, project, message and payment data is collected, how it is used, and
        the processors involved (Supabase for data, Stripe for payments).
      </p>
    </div>
  );
}
