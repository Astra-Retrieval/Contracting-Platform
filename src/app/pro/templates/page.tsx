import { deleteTemplate } from "@/app/actions/quotes";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink, Card, Empty, Flash, PageHeader, type SearchParams } from "@/components/ui";
import { requirePro } from "@/lib/auth";
import { cleanTemplate, totals } from "@/lib/estimate";
import { money, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Estimate templates" };

export default async function TemplatesPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requirePro();
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("estimate_templates")
    .select("id, name, data, updated_at")
    .eq("pro_id", viewer.id)
    .order("name");
  const rows = (data ?? []).map((r) => ({ ...r, data: cleanTemplate(r.data) }));

  return (
    <div className="page">
      <Flash params={params} />
      <PageHeader
        title="Estimate templates"
        subtitle="Saved estimates for the jobs you quote often. Start a quote from one, then adjust the numbers."
        action={<ButtonLink href="/pro/templates/new">New template</ButtonLink>}
      />
      {rows.length === 0 ? (
        <Empty title="No templates yet">
          Build one here, or tick &ldquo;Save this as a template&rdquo; when you send a quote.
        </Empty>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const lines = r.data.estimate.sections.reduce((n, s) => n + s.lines.length, 0);
            const total = totals(r.data.estimate).total || r.data.milestones.reduce((n, m) => n + m.amountCents, 0);
            return (
              <li key={r.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-stone-900">{r.name}</p>
                    <p className="text-sm text-stone-500">
                      {[
                        lines
                          ? `${r.data.estimate.sections.length} section${r.data.estimate.sections.length === 1 ? "" : "s"}, ${lines} line${lines === 1 ? "" : "s"}`
                          : "Simple price",
                        `${r.data.milestones.length} milestone${r.data.milestones.length === 1 ? "" : "s"}`,
                        `Updated ${shortDate(r.updated_at)}`,
                      ].join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {total > 0 && <span className="font-semibold tabular-nums">{money(total)}</span>}
                    <ButtonLink href={`/pro/templates/${r.id}`} variant="secondary" small>
                      Edit
                    </ButtonLink>
                    <form action={deleteTemplate}>
                      <input type="hidden" name="template_id" value={r.id} />
                      <SubmitButton variant="ghost" small confirm={`Delete the template "${r.name}"?`}>
                        Delete
                      </SubmitButton>
                    </form>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
