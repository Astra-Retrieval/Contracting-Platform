import Link from "next/link";
import { ButtonLink, Card, Empty, Flash, PageHeader, StatusBadge, type SearchParams } from "@/components/ui";
import { requireCustomer } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireCustomer();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, description, status, budget_cents, city, state, created_at")
    .eq("customer_id", viewer.id)
    .order("created_at", { ascending: false });

  return (
    <div className="page">
      <Flash params={params} />
      <PageHeader
        title="My projects"
        subtitle="Everything you have planned, in progress, and finished."
        action={<ButtonLink href="/projects/new">New project</ButtonLink>}
      />
      {(projects ?? []).length === 0 ? (
        <Empty title="No projects yet">
          Describe the job, then request quotes from pros.
          <div className="mt-4">
            <ButtonLink href="/projects/new">Create a project</ButtonLink>
          </div>
        </Empty>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {(projects ?? []).map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="block h-full">
                <Card className="h-full hover:border-brand-300">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-stone-900">{p.title}</p>
                    <StatusBadge status={p.status} />
                  </div>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-stone-600">{p.description}</p>
                  )}
                  <p className="mt-3 text-sm text-stone-500">
                    {[
                      p.budget_cents ? `Budget ${money(p.budget_cents)}` : null,
                      [p.city, p.state].filter(Boolean).join(", ") || null,
                      `Created ${shortDate(p.created_at)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
