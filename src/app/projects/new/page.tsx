import { createProject } from "@/app/actions/projects";
import { PhotoField } from "@/components/photo-picker";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink, Card, Field, Flash, PageHeader, inputCls, type SearchParams } from "@/components/ui";
import { requireCustomer } from "@/lib/auth";
import { getCategories } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireCustomer();
  const params = await searchParams;
  const supabase = await createClient();
  const [categories, { data: profile }] = await Promise.all([
    getCategories(supabase),
    supabase.from("profiles").select("city, state").eq("id", viewer.id).maybeSingle(),
  ]);

  return (
    <div className="page page-narrow">
      <PageHeader
        title="New project"
        subtitle="Describe what you want done. You can request quotes from pros on the next step."
      />
      <Flash params={params} />
      <Card>
        <form action={createProject} className="space-y-4">
          <Field label="Project title">
            <input
              name="title"
              required
              maxLength={120}
              placeholder="e.g. Built-in bookshelf for the living room"
              className={inputCls}
            />
          </Field>
          <Field
            label="What do you want done?"
            hint="Sizes, materials, the current condition, and anything a pro would need to price the job."
          >
            <textarea name="description" rows={6} className={inputCls} />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium text-stone-800">Photos</p>
            <PhotoField userId={viewer.id} folder="projects" max={12} label="Add photos" />
            <p className="mt-1.5 text-xs text-stone-500">
              Optional. Photos of the space or the problem help pros give an accurate price.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Main trade">
              <select name="category_id" defaultValue="" className={inputCls}>
                <option value="">Not sure / several</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Total budget" hint="Optional. Used by your budget tracker.">
              <input name="budget" inputMode="decimal" placeholder="$" className={inputCls} />
            </Field>
            <Field label="City">
              <input name="city" autoComplete="address-level2" defaultValue={profile?.city ?? ""} className={inputCls} />
            </Field>
            <Field label="State">
              <input
                name="state"
                maxLength={2}
                placeholder="e.g. SC"
                autoComplete="address-level1"
                defaultValue={profile?.state ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Ideal start date">
              <input name="target_start" type="date" className={inputCls} />
            </Field>
            <Field label="Ideal finish date">
              <input name="target_end" type="date" className={inputCls} />
            </Field>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
            <input type="checkbox" name="open_to_pros" defaultChecked className="mt-0.5 size-4 accent-brand-600" />
            <span>
              <span className="font-medium text-stone-900">Let pros find this project</span>
              <span className="block text-stone-600">
                Pros on Crew Orchard can see the description, photos, location, and budget, and
                offer you a quote. Your name stays hidden until they do. Untick this to hear only
                from pros you invite.
              </span>
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <ButtonLink href="/projects" variant="ghost">
              Cancel
            </ButtonLink>
            <SubmitButton pendingText="Creating…">Create project</SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
