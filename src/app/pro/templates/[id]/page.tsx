import Link from "next/link";
import { notFound } from "next/navigation";
import { saveTemplate } from "@/app/actions/quotes";
import { QuoteBuilder } from "@/components/quote-builder";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink, Card, Field, Flash, inputCls, type SearchParams } from "@/components/ui";
import { requirePro } from "@/lib/auth";
import { PLATFORM_FEE_BPS, PROCESSING_FEE_BPS, PROCESSING_FEE_FIXED_CENTS } from "@/lib/config";
import { cleanTemplate } from "@/lib/estimate";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Estimate template" };

// `/pro/templates/new` starts an empty template; any other id edits a saved one.
export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const viewer = await requirePro();
  const { id } = await params;
  const query = await searchParams;
  const isNew = id === "new";

  let template: { name: string; data: unknown } | null = null;
  if (!isNew) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("estimate_templates")
      .select("name, data")
      .eq("id", id)
      .eq("pro_id", viewer.id)
      .maybeSingle();
    if (!data) notFound();
    template = data;
  }

  return (
    <div className="page">
      <Link href="/pro/templates" className="text-sm text-stone-500 hover:text-stone-800">
        ← Estimate templates
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-bold tracking-tight">{isNew ? "New template" : "Edit template"}</h1>
      <Flash params={query} />
      <Card>
        <form action={saveTemplate} className="space-y-6">
          {!isNew && <input type="hidden" name="template_id" value={id} />}
          <Field label="Template name">
            <input
              name="name"
              required
              maxLength={80}
              defaultValue={template?.name ?? ""}
              placeholder="e.g. Standard deck rebuild"
              className={`${inputCls} max-w-md`}
            />
          </Field>
          <QuoteBuilder
            mode="template"
            feeBps={PLATFORM_FEE_BPS}
            processingBps={PROCESSING_FEE_BPS}
            processingFixedCents={PROCESSING_FEE_FIXED_CENTS}
            initial={template ? cleanTemplate(template.data) : undefined}
          />
          <div className="flex justify-end gap-2">
            <ButtonLink href="/pro/templates" variant="ghost">
              Cancel
            </ButtonLink>
            <SubmitButton pendingText="Saving…">Save template</SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
