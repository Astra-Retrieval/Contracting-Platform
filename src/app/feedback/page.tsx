import { submitFeatureRequest } from "@/app/actions/feedback";
import { FeatureStatus } from "@/components/feature-status";
import { SubmitButton } from "@/components/submit-button";
import { Card, Flash, PageHeader, SectionTitle, inputCls, type SearchParams } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Request a feature" };

export default async function FeedbackPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const supabase = await createClient();
  // Row-level security returns only this member's own requests.
  const { data: mine } = await supabase
    .from("feature_requests")
    .select("id, body, status, staff_note, created_at")
    .eq("user_id", viewer.id)
    .order("created_at", { ascending: false });

  return (
    <div className="page page-narrow">
      <PageHeader
        title="Request a feature"
        subtitle="Tell us what would make Crew Orchard work better for you. We read every request."
      />
      <Flash params={params} />
      <Card>
        <form action={submitFeatureRequest} className="space-y-3">
          <textarea
            name="body"
            required
            minLength={5}
            maxLength={2000}
            rows={5}
            aria-label="Your idea"
            placeholder="What would you like to be able to do, and why would it help?"
            className={inputCls}
          />
          <div className="flex justify-end">
            <SubmitButton pendingText="Sending…">Send request</SubmitButton>
          </div>
        </form>
      </Card>

      {(mine ?? []).length > 0 && (
        <section className="mt-8">
          <SectionTitle>Your requests</SectionTitle>
          <ul className="space-y-3">
            {(mine ?? []).map((r) => (
              <li key={r.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-stone-500">{shortDate(r.created_at)}</p>
                    <FeatureStatus status={r.status} />
                  </div>
                  <p className="mt-2 text-sm whitespace-pre-wrap text-stone-800">{r.body}</p>
                  {r.staff_note && (
                    <p className="mt-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
                      <span className="font-medium text-stone-900">From our team:</span> {r.staff_note}
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
