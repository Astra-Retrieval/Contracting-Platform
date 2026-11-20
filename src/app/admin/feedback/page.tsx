import { setFeatureRequestStatus } from "@/app/actions/admin";
import { AdminTabs } from "@/components/admin-tabs";
import { FeatureStatus } from "@/components/feature-status";
import { SubmitButton } from "@/components/submit-button";
import { Card, Empty, Flash, PageHeader, inputCls, type SearchParams } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Feature requests" };

const order = ["new", "planned", "done", "declined"];

export default async function AdminFeedbackPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const admin = createAdminClient();
  const { data } = await admin
    .from("feature_requests")
    .select("id, user_id, body, status, staff_note, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = [...(data ?? [])].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const { data: people } = rows.length
    ? await admin.from("profiles").select("id, full_name, role").in("id", rows.map((r) => r.user_id))
    : { data: [] };
  const person = new Map((people ?? []).map((p) => [p.id, p]));

  return (
    <div className="page">
      <PageHeader
        title="Feature requests"
        subtitle="What customers and pros have asked for. The status and your note are shown to the person who asked."
      />
      <AdminTabs current="/admin/feedback" />
      <Flash params={params} />
      {rows.length === 0 ? (
        <Empty title="No feature requests yet" />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const who = person.get(r.user_id);
            return (
              <li key={r.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-stone-600">
                      <span className="font-medium text-stone-900">{who?.full_name || "Member"}</span>
                      {who && ` · ${who.role === "pro" ? "Pro" : "Customer"}`} · {shortDate(r.created_at)}
                    </p>
                    <FeatureStatus status={r.status} />
                  </div>
                  <p className="mt-2 text-sm whitespace-pre-wrap text-stone-800">{r.body}</p>
                  <form action={setFeatureRequestStatus} className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
                    <input type="hidden" name="request_id" value={r.id} />
                    <select name="status" defaultValue={r.status} aria-label="Status" className={`${inputCls} w-auto`}>
                      <option value="new">New</option>
                      <option value="planned">Planned</option>
                      <option value="done">Done</option>
                      <option value="declined">Not planned</option>
                    </select>
                    <input
                      name="staff_note"
                      defaultValue={r.staff_note}
                      maxLength={500}
                      aria-label="Note to the member"
                      placeholder="Note to the member (optional)"
                      className={`${inputCls} max-w-md flex-1`}
                    />
                    <SubmitButton small variant="secondary" pendingText="Saving…">
                      Save
                    </SubmitButton>
                  </form>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
