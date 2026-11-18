import { APP_NAME } from "@/lib/config";

export const metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <div className="page page-narrow">
      <h1 className="text-2xl font-bold tracking-tight">Terms of service</h1>
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Placeholder. Replace this page with terms reviewed by a lawyer before {APP_NAME} takes live
        payments. They should cover the pro agreement, platform fees, milestone payments and
        releases, disputes and refunds, reviews, and licensing responsibilities.
      </p>
    </div>
  );
}
