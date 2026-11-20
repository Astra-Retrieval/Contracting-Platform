import Link from "next/link";
import { reviewCredential } from "@/app/actions/credentials";
import { AdminTabs } from "@/components/admin-tabs";
import { CredentialStatus } from "@/components/credentials";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Empty, Flash, PageHeader, SectionTitle, inputCls, type SearchParams } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { credentialType, dateInDays, type Credential } from "@/lib/credentials";
import { money, shortDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Documents" };

type Row = Credential & { file_path: string; review_note: string };

export default async function AdminCredentialsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const admin = createAdminClient();
  const soon = dateInDays(30);
  const { data } = await admin
    .from("pro_credentials")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as Row[];
  const { data: pros } = rows.length
    ? await admin.from("pro_profiles").select("user_id, business_name").in("user_id", [...new Set(rows.map((r) => r.pro_id))])
    : { data: [] };
  const proName = new Map((pros ?? []).map((p) => [p.user_id, p.business_name]));

  // Links to the private files that work for ten minutes.
  const paths = rows.map((r) => r.file_path).filter(Boolean);
  const { data: signed } = paths.length
    ? await admin.storage.from("credentials").createSignedUrls(paths, 600)
    : { data: [] };
  const fileUrl = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const waiting = rows.filter((r) => r.status === "pending");
  const expiring = rows.filter((r) => r.status === "verified" && r.expires_on && r.expires_on <= soon);
  const rest = rows.filter((r) => !waiting.includes(r) && !expiring.includes(r));

  const item = (r: Row) => {
    const type = credentialType(r.type);
    return (
      <li key={r.id}>
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-stone-900">{type?.label ?? r.type}</p>
              <p className="text-sm text-stone-600">
                <Link href={`/pros/${r.pro_id}`} className="font-medium text-stone-900 hover:text-brand-700">
                  {proName.get(r.pro_id) || "Pro"}
                </Link>{" "}
                · uploaded {shortDate(r.created_at)}
              </p>
            </div>
            <CredentialStatus credential={r} />
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-stone-500">Number</dt>
              <dd className="font-medium tabular-nums">{r.number || "Not given"}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">Name on document</dt>
              <dd>{r.holder_name || "Not given"}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">{type?.kind === "insurance" ? "Insurer" : "Classification"}</dt>
              <dd>{r.classification || "Not given"}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">Expires</dt>
              <dd>{r.expires_on ? shortDate(r.expires_on) : "No date"}</dd>
            </div>
            {r.coverage_cents != null && (
              <div>
                <dt className="text-xs text-stone-500">Coverage</dt>
                <dd className="tabular-nums">{money(r.coverage_cents)}</dd>
              </div>
            )}
          </dl>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {fileUrl.get(r.file_path) ? (
              <a href={fileUrl.get(r.file_path) ?? undefined} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">
                Open the uploaded document
              </a>
            ) : (
              <span className="text-stone-500">No file</span>
            )}
            {type?.lookupUrl && (
              <a href={type.lookupUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">
                Open the issuer&apos;s lookup
              </a>
            )}
          </p>
          {type?.lookupHint && <p className="mt-1 text-sm text-stone-600">{type.lookupHint}</p>}
          {r.review_note && <p className="mt-2 text-sm text-stone-600">Last note: {r.review_note}</p>}
          <form action={reviewCredential} className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
            <input type="hidden" name="credential_id" value={r.id} />
            <input
              name="note"
              maxLength={500}
              aria-label="Note to the pro"
              placeholder="Note to the pro (needed to reject)"
              className={`${inputCls} max-w-md flex-1`}
            />
            <SubmitButton small name="decision" value="verified" pendingText="Saving…">
              Checked, it matches
            </SubmitButton>
            <SubmitButton small variant="danger" name="decision" value="rejected" pendingText="Saving…">
              Reject
            </SubmitButton>
          </form>
        </Card>
      </li>
    );
  };

  return (
    <div className="page">
      <PageHeader
        title="Documents"
        subtitle="Licenses, insurance, bonds, and certifications pros have uploaded. Check each one against the issuer: the name matches, it is active, and the expiry date is right."
      />
      <AdminTabs current="/admin/credentials" />
      <Flash params={params} />
      {rows.length === 0 ? (
        <Empty title="No documents uploaded yet" />
      ) : (
        <div className="space-y-8">
          <section>
            <SectionTitle>
              Waiting for a check <Badge tone={waiting.length ? "amber" : "gray"}>{waiting.length}</Badge>
            </SectionTitle>
            {waiting.length ? <ul className="space-y-3">{waiting.map(item)}</ul> : <p className="text-sm text-stone-500">Nothing waiting.</p>}
          </section>
          <section>
            <SectionTitle>
              Expiring within 30 days <Badge tone={expiring.length ? "amber" : "gray"}>{expiring.length}</Badge>
            </SectionTitle>
            {expiring.length ? (
              <ul className="space-y-3">{expiring.map(item)}</ul>
            ) : (
              <p className="text-sm text-stone-500">Nothing expiring soon. The pro is emailed automatically a month before.</p>
            )}
          </section>
          {rest.length > 0 && (
            <section>
              <SectionTitle>Everything else</SectionTitle>
              <ul className="space-y-3">{rest.map(item)}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
