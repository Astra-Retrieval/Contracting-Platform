import { AdminTabs } from "@/components/admin-tabs";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Waitlist" };

export default async function AdminWaitlistPage() {
  await requireAdmin();
  const { data } = await createAdminClient()
    .from("waitlist")
    .select("id, name, email, trade, city, state, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  const rows = data ?? [];
  const byState = new Map<string, number>();
  for (const r of rows) byState.set(r.state, (byState.get(r.state) ?? 0) + 1);
  const states = [...byState.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="page">
      <PageHeader title="Waitlist" subtitle="Pros in states that are not open yet, newest first." />
      <AdminTabs current="/admin/waitlist" />
      {rows.length === 0 ? (
        <Empty title="Nobody on the waitlist yet" />
      ) : (
        <>
          <p className="mb-4 text-sm text-stone-600">
            {rows.length} in total. By state: {states.map(([s, n]) => `${s} ${n}`).join(", ")}
          </p>
          <Card className="overflow-x-auto p-0!">
            <table className="w-full min-w-xl text-left text-sm">
              <thead className="bg-stone-50 text-xs tracking-wide text-stone-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Trade</th>
                  <th className="px-4 py-2.5 font-medium">Location</th>
                  <th className="px-4 py-2.5 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 font-medium text-stone-900">{r.name}</td>
                    <td className="px-4 py-2.5">{r.email}</td>
                    <td className="px-4 py-2.5">{r.trade || "Not given"}</td>
                    <td className="px-4 py-2.5">{[r.city, r.state].filter(Boolean).join(", ")}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{shortDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
