import Link from "next/link";
import { setReviewHidden } from "@/app/actions/admin";
import { AdminTabs } from "@/components/admin-tabs";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Empty, Flash, PageHeader, Stars, inputCls, type SearchParams } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Reviews" };

export default async function AdminReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const admin = createAdminClient();
  const { data: reviews } = await admin
    .from("reviews")
    .select("id, pro_id, reviewer_id, rating, body, created_at, hidden_at, hidden_reason")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = reviews ?? [];
  const [{ data: people }, { data: pros }] = rows.length
    ? await Promise.all([
        admin.from("profiles").select("id, full_name").in("id", rows.map((r) => r.reviewer_id)),
        admin.from("pro_profiles").select("user_id, business_name").in("user_id", rows.map((r) => r.pro_id)),
      ])
    : [{ data: [] }, { data: [] }];
  const person = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const pro = new Map((pros ?? []).map((p) => [p.user_id, p.business_name]));

  return (
    <div className="page">
      <PageHeader
        title="Reviews"
        subtitle="The 200 most recent customer reviews. Hide one that breaks the content rules; it stops showing and stops counting in the pro's rating."
      />
      <AdminTabs current="/admin/reviews" />
      <Flash params={params} />
      {rows.length === 0 ? (
        <Empty title="No reviews yet" />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className={r.hidden_at ? "border-amber-200 bg-amber-50/50" : undefined}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-stone-600">
                      <span className="font-medium text-stone-900">{person.get(r.reviewer_id) || "Customer"}</span>{" "}
                      reviewed{" "}
                      <Link href={`/pros/${r.pro_id}`} className="font-medium text-stone-900 hover:text-brand-700">
                        {pro.get(r.pro_id) || "a pro"}
                      </Link>{" "}
                      on {shortDate(r.created_at)}
                    </p>
                    <div className="mt-1">
                      <Stars value={r.rating} />
                    </div>
                  </div>
                  {r.hidden_at && <Badge tone="amber">Hidden {shortDate(r.hidden_at)}</Badge>}
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap text-stone-800">{r.body || "No written review."}</p>
                {r.hidden_at ? (
                  <form action={setReviewHidden} className="mt-3 flex flex-wrap items-center gap-3 border-t border-amber-100 pt-3">
                    <input type="hidden" name="review_id" value={r.id} />
                    <input type="hidden" name="hide" value="false" />
                    <p className="text-sm text-stone-600">Reason: {r.hidden_reason}</p>
                    <SubmitButton small variant="secondary" pendingText="Restoring…">
                      Restore review
                    </SubmitButton>
                  </form>
                ) : (
                  <form action={setReviewHidden} className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
                    <input type="hidden" name="review_id" value={r.id} />
                    <input type="hidden" name="hide" value="true" />
                    <input
                      name="reason"
                      required
                      minLength={5}
                      maxLength={300}
                      aria-label="Reason for hiding"
                      placeholder="Reason for hiding (staff only)"
                      className={`${inputCls} max-w-sm`}
                    />
                    <SubmitButton small variant="danger" pendingText="Hiding…" confirm="Hide this review from the public profile?">
                      Hide review
                    </SubmitButton>
                  </form>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
