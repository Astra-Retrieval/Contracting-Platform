import Link from "next/link";
import { deleteCredential } from "@/app/actions/credentials";
import { CredentialForm } from "@/components/credential-form";
import { CredentialList } from "@/components/credentials";
import { SubmitButton } from "@/components/submit-button";
import { Badge, ButtonLink, Card, Flash, PageHeader, SectionTitle, type SearchParams } from "@/components/ui";
import { requirePro } from "@/lib/auth";
import { CREDENTIAL_TYPES, TRADE_RULES, credentialType, evaluate, isCurrent } from "@/lib/credentials";
import { loadProDocs } from "@/lib/credentials-server";
import { shortDate } from "@/lib/format";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const metadata = { title: "Licenses and insurance" };

export default async function ProCredentialsPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requirePro();
  const params = await searchParams;
  const admin = createAdminClient();
  const supabase = await createClient();
  const [{ trades, credentials }, { data: notes }, { data: auth }] = await Promise.all([
    loadProDocs(admin, viewer.id),
    // Staff notes are private to the pro, so they are read with the service role.
    admin.from("pro_credentials").select("id, review_note").eq("pro_id", viewer.id),
    supabase.auth.getUser(),
  ]);
  const { requirements, status } = evaluate(trades, credentials);
  // Keep the stored summary (used in search and on quotes) in step with what this page shows.
  await admin.from("pro_profiles").update({ docs_status: status }).eq("user_id", viewer.id).neq("docs_status", status);
  const noteFor = new Map((notes ?? []).map((n) => [n.id, n.review_note]));
  const held = new Set(credentials.filter((c) => isCurrent(c)).map((c) => c.type));
  // Documents ticked on the sign-up form that have not been uploaded yet.
  const declared = (Array.isArray(auth.user?.user_metadata?.docs) ? (auth.user.user_metadata.docs as unknown[]) : [])
    .map(String)
    .filter((id) => credentialType(id) && !held.has(id));
  const recommended = [...new Set(trades.flatMap((t) => TRADE_RULES[t.slug]?.recommended ?? []))].filter(
    (id) => !held.has(id),
  );
  const firstMissing = requirements.find((r) => r.state === "missing")?.anyOf[0] ?? declared[0];
  const notesByTrade = trades.map((t) => [t.name, TRADE_RULES[t.slug]?.note] as const).filter(([, n]) => n);

  return (
    <div className="page page-narrow">
      <PageHeader
        title="Licenses and insurance"
        subtitle="Customers see what you provide here, and are told to check it before they accept a quote."
        action={
          <ButtonLink href={`/pros/${viewer.id}#documents`} variant="secondary" small>
            See what customers see
          </ButtonLink>
        }
      />
      <Flash params={params} />

      <section className="mb-8">
        <SectionTitle>What South Carolina requires for your trades</SectionTitle>
        <Card>
          {trades.length === 0 ? (
            <p className="text-sm text-stone-600">
              You have not chosen any trades yet.{" "}
              <Link href="/pro/profile" className="font-semibold text-brand-700 underline">
                Choose your trades
              </Link>{" "}
              to see what you need.
            </p>
          ) : requirements.length === 0 ? (
            <p className="text-sm text-stone-600">
              Your trades ({trades.map((t) => t.name).join(", ")}) do not need a state license for small
              jobs. Adding insurance still helps you win work.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {requirements.map((r) => (
                <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium text-stone-900">
                      <span aria-hidden="true">⚑ </span>
                      {r.label}
                    </p>
                    {r.state === "verified" ? (
                      <Badge tone="green">Checked</Badge>
                    ) : r.state === "provided" ? (
                      <Badge tone="amber">Provided, waiting for our check</Badge>
                    ) : (
                      <Badge tone="red">Missing</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-stone-600">
                    For {r.trades.join(", ")}. {r.rule}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Any one of these counts: {r.anyOf.map((id) => credentialType(id)?.label).join("; ")}.
                  </p>
                </li>
              ))}
            </ul>
          )}
          {status === "missing" && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              Until you add what is missing, your profile and every quote you send carry a red
              &ldquo;No proof of license provided&rdquo; warning. You can still send quotes.
            </p>
          )}
          {notesByTrade.map(([name, note]) => (
            <p key={name} className="mt-3 text-sm text-stone-600">
              <span className="font-medium text-stone-900">{name}:</span> {note}
            </p>
          ))}
          {(declared.length > 0 || recommended.length > 0) && (
            <div className="mt-4 border-t border-stone-100 pt-3 text-sm text-stone-700">
              {declared.length > 0 && (
                <p>
                  <span className="font-medium text-stone-900">You said you have these when you signed up:</span>{" "}
                  {declared.map((id) => credentialType(id)?.label).join("; ")}. Upload them below.
                </p>
              )}
              {recommended.length > 0 && (
                <p className="mt-1">
                  <span className="font-medium text-stone-900">Worth adding:</span>{" "}
                  {recommended.map((id) => credentialType(id)?.label).join("; ")}.
                </p>
              )}
            </div>
          )}
        </Card>
      </section>

      <section className="mb-8">
        <SectionTitle>Your documents</SectionTitle>
        <Card>
          <CredentialList
            credentials={credentials.filter((c) => c.status !== "rejected")}
            empty="Nothing uploaded yet."
          />
          {credentials.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-stone-100 pt-3">
              {credentials.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-stone-700">
                    {credentialType(c.type)?.label ?? c.type}
                    {c.number && ` · ${c.number}`} · added {shortDate(c.created_at)}
                    {c.status === "rejected" && (
                      <span className="block text-red-800">
                        Could not be confirmed. {noteFor.get(c.id)}
                      </span>
                    )}
                  </span>
                  <form action={deleteCredential}>
                    <input type="hidden" name="credential_id" value={c.id} />
                    <SubmitButton variant="ghost" small confirm="Remove this document from your profile?">
                      Remove
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>Add a document</SectionTitle>
        <Card>
          <CredentialForm userId={viewer.id} suggested={firstMissing} />
          <p className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-500">
            We check each document against the issuer and email you the result. We email you a month
            before a document expires. We keep {CREDENTIAL_TYPES.length} kinds of document on file; if
            yours is not listed, message us.
          </p>
        </Card>
      </section>
    </div>
  );
}
