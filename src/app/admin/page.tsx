import Link from "next/link";
import { AdminTabs } from "@/components/admin-tabs";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Staff" };

export default async function AdminHome() {
  await requireAdmin();
  const admin = createAdminClient();
  const count = (table: string) => admin.from(table).select("*", { count: "exact", head: true });
  const [disputes, documents, hidden, requests, waitlist, customers, pros] = await Promise.all([
    count("disputes").eq("status", "escalated"),
    count("pro_credentials").eq("status", "pending"),
    count("reviews").not("hidden_at", "is", null),
    count("feature_requests").eq("status", "new"),
    count("waitlist"),
    count("profiles").eq("role", "customer"),
    count("profiles").eq("role", "pro"),
  ]);

  const cards: [string, string, number, string][] = [
    ["/admin/disputes", "Disputes waiting for a decision", disputes.count ?? 0, "Decide how a disputed payment is split."],
    ["/admin/credentials", "Documents waiting for a check", documents.count ?? 0, "Licenses and insurance pros have uploaded."],
    ["/admin/reviews", "Hidden reviews", hidden.count ?? 0, "Read recent reviews and hide ones that break the rules."],
    ["/admin/feedback", "New feature requests", requests.count ?? 0, "What members are asking for."],
    ["/admin/waitlist", "Pros on the waitlist", waitlist.count ?? 0, "Pros in states that are not open yet."],
  ];

  return (
    <div className="page">
      <PageHeader
        title="Staff"
        subtitle={`Platform staff only. ${customers.count ?? 0} customers and ${pros.count ?? 0} pros have accounts.`}
      />
      <AdminTabs current="/admin" />
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(([href, label, value, hint]) => (
          <Link key={href} href={href} className="block">
            <Card className="h-full hover:border-brand-300">
              <p className="text-3xl font-bold text-stone-900 tabular-nums">{value}</p>
              <p className="mt-1 font-medium text-stone-900">{label}</p>
              <p className="mt-0.5 text-sm text-stone-600">{hint}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
