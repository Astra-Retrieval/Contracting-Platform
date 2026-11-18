import { addPortfolioPhoto, deletePortfolioPhoto, updateProProfile } from "@/app/actions/profile";
import { PhotoUploader } from "@/components/photo-uploader";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink, Card, Field, Flash, PageHeader, SectionTitle, inputCls, type SearchParams } from "@/components/ui";
import { requirePro } from "@/lib/auth";
import { getCategories } from "@/lib/data";
import { photoUrl } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Your profile" };

export default async function ProProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requirePro();
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: pro }, categories, { data: mine }, { data: photos }] = await Promise.all([
    supabase.from("pro_profiles").select("*").eq("user_id", viewer.id).maybeSingle(),
    getCategories(supabase),
    supabase.from("pro_categories").select("category_id").eq("pro_id", viewer.id),
    supabase.from("portfolio_photos").select("id, storage_path").eq("pro_id", viewer.id).order("created_at"),
  ]);
  const selected = new Set((mine ?? []).map((m) => m.category_id));
  const num = (v: number | null | undefined) => (v == null ? "" : String(v));

  return (
    <div className="page max-w-3xl!">
      <PageHeader
        title="Your profile"
        subtitle="This is what customers and other contractors see."
        action={
          <ButtonLink href={`/pros/${viewer.id}`} variant="secondary">
            View public profile
          </ButtonLink>
        }
      />
      <Flash params={params} />

      <form action={updateProProfile} className="space-y-6">
        <Card className="space-y-4">
          <SectionTitle>About your business</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">
              <input name="business_name" required defaultValue={pro?.business_name ?? ""} className={inputCls} />
            </Field>
            <Field label="Your name">
              <input name="full_name" defaultValue={viewer.fullName} className={inputCls} />
            </Field>
          </div>
          <Field label="Headline" hint="One line on what you do, e.g. Kitchen and bath remodels since 2009.">
            <input name="headline" maxLength={140} defaultValue={pro?.headline ?? ""} className={inputCls} />
          </Field>
          <Field label="About" hint="The work you take on, your crew, and what sets you apart.">
            <textarea name="bio" rows={6} defaultValue={pro?.bio ?? ""} className={inputCls} />
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-stone-800">Trades you offer</legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    name="category"
                    value={c.id}
                    defaultChecked={selected.has(c.id)}
                    className="size-4 accent-orange-600"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        <Card className="space-y-4">
          <SectionTitle>Location</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="City" className="sm:col-span-2">
              <input name="city" defaultValue={pro?.city ?? ""} className={inputCls} />
            </Field>
            <Field label="State">
              <input name="state" maxLength={2} defaultValue={pro?.state ?? ""} className={inputCls} />
            </Field>
            <Field label="ZIP">
              <input name="zip" inputMode="numeric" maxLength={10} defaultValue={pro?.zip ?? ""} className={inputCls} />
            </Field>
            <Field label="Service radius (miles)" className="sm:col-span-2">
              <input name="service_radius_miles" inputMode="numeric" defaultValue={num(pro?.service_radius_miles)} className={inputCls} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4">
          <SectionTitle>Pricing and timeline</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Hourly rate from ($)">
              <input name="hourly_rate_min" inputMode="numeric" defaultValue={num(pro?.hourly_rate_min)} className={inputCls} />
            </Field>
            <Field label="Hourly rate to ($)">
              <input name="hourly_rate_max" inputMode="numeric" defaultValue={num(pro?.hourly_rate_max)} className={inputCls} />
            </Field>
            <Field label="Typical job from ($)">
              <input name="job_min" inputMode="numeric" defaultValue={num(pro?.job_min)} className={inputCls} />
            </Field>
            <Field label="Typical job to ($)">
              <input name="job_max" inputMode="numeric" defaultValue={num(pro?.job_max)} className={inputCls} />
            </Field>
          </div>
          <Field label="Typical timeline" hint="e.g. Small jobs within a week; remodels booked 4 to 6 weeks out.">
            <input name="typical_timeline" maxLength={200} defaultValue={pro?.typical_timeline ?? ""} className={inputCls} />
          </Field>
          <Field label="Pricing notes" hint="Minimum charge, call-out fees, what a quote includes.">
            <textarea name="pricing_notes" rows={3} defaultValue={pro?.pricing_notes ?? ""} className={inputCls} />
          </Field>
        </Card>

        <Card className="space-y-4">
          <SectionTitle>Credentials</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Years in business">
              <input name="years_experience" inputMode="numeric" defaultValue={num(pro?.years_experience)} className={inputCls} />
            </Field>
            <Field label="License number" hint="Shown on your profile. Leave blank if not applicable.">
              <input name="license_number" defaultValue={pro?.license_number ?? ""} className={inputCls} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" name="insured" defaultChecked={pro?.insured ?? false} className="size-4 accent-orange-600" />
            I carry liability insurance
          </label>
        </Card>

        <div className="flex justify-end">
          <SubmitButton pendingText="Saving…">Save profile</SubmitButton>
        </div>
      </form>

      <Card className="mt-6">
        <div id="photos" className="scroll-mt-24">
          <SectionTitle
            action={<PhotoUploader userId={viewer.id} folder="portfolio" onUploaded={addPortfolioPhoto} />}
          >
            Photos of your work
          </SectionTitle>
        </div>
        {(photos ?? []).length === 0 ? (
          <p className="text-sm text-stone-500">
            No photos yet. Before-and-after shots and finished work help customers choose you.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(photos ?? []).map((p) => (
              <li key={p.id} className="relative overflow-hidden rounded-lg border border-stone-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(p.storage_path)} alt="Portfolio photo" className="aspect-square size-full object-cover" />
                <form action={deletePortfolioPhoto} className="absolute top-1.5 right-1.5">
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton variant="danger" small pendingText="…" confirm="Remove this photo?">
                    Remove
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
