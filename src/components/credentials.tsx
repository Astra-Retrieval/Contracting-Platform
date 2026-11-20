import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import {
  credentialType,
  isCurrent,
  type Credential,
  type DocsStatus,
  type RequirementState,
} from "@/lib/credentials";
import { money, shortDate } from "@/lib/format";

export function CredentialStatus({ credential }: { credential: Credential }) {
  if (credential.status === "verified" && isCurrent(credential)) return <Badge tone="green">Checked by Crew Orchard</Badge>;
  if (credential.status === "rejected") return <Badge tone="red">Could not be confirmed</Badge>;
  if (!isCurrent(credential)) return <Badge tone="red">Expired</Badge>;
  return <Badge tone="amber">Provided, not yet checked</Badge>;
}

/** The big label for a pro who has not shown proof of what their trades require. */
export function DocsWarning({
  status,
  requirements,
  name = "This pro",
  compact = false,
  children,
}: {
  status: DocsStatus;
  requirements?: RequirementState[];
  name?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  if (status !== "missing") return null;
  const missing = (requirements ?? []).filter((r) => r.state === "missing");
  return (
    <div role="alert" className={`rounded-xl border-2 border-red-300 bg-red-50 ${compact ? "p-3" : "p-4"}`}>
      <p className={`font-bold text-red-900 ${compact ? "text-sm" : "text-base"}`}>
        ⚠ No proof of license provided
      </p>
      <p className="mt-1 text-sm text-red-900">
        {name} has not given Crew Orchard proof of a license or registration that South Carolina
        requires for their trades on jobs above the state&apos;s dollar limits. You can still hire them,
        but ask to see their license, bond, and insurance, and check them yourself first.
      </p>
      {!compact && missing.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-900">
          {missing.map((r) => (
            <li key={r.id}>
              <span className="font-medium">{r.label}</span> ({r.trades.join(", ")}). {r.rule}
            </li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}

/** One badge that sums up a pro's documents, for search results and quote cards. */
export function DocsBadge({ status }: { status: DocsStatus }) {
  if (status === "verified") return <Badge tone="green">License checked</Badge>;
  if (status === "provided") return <Badge tone="amber">Documents provided, not yet checked</Badge>;
  if (status === "missing") return <Badge tone="red">⚠ No proof of license</Badge>;
  return null;
}

/** What a pro has provided, with what a customer needs to check it themselves. */
export function CredentialList({ credentials, empty }: { credentials: Credential[]; empty?: string }) {
  const shown = credentials.filter((c) => c.status !== "rejected");
  if (!shown.length) return empty ? <p className="text-sm text-stone-500">{empty}</p> : null;
  return (
    <ul className="divide-y divide-stone-100">
      {shown.map((c) => {
        const type = credentialType(c.type);
        return (
          <li key={c.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-medium text-stone-900">{type?.label ?? c.type}</p>
              <CredentialStatus credential={c} />
            </div>
            <dl className="mt-1 grid gap-x-6 gap-y-0.5 text-sm text-stone-700 sm:grid-cols-2">
              {c.number && (
                <div>
                  <dt className="inline text-stone-500">Number: </dt>
                  <dd className="inline font-medium tabular-nums">{c.number}</dd>
                </div>
              )}
              {c.holder_name && (
                <div>
                  <dt className="inline text-stone-500">Issued to: </dt>
                  <dd className="inline">{c.holder_name}</dd>
                </div>
              )}
              {c.classification && (
                <div>
                  <dt className="inline text-stone-500">{type?.kind === "insurance" ? "Insurer: " : "Classification: "}</dt>
                  <dd className="inline">{c.classification}</dd>
                </div>
              )}
              {c.coverage_cents != null && (
                <div>
                  <dt className="inline text-stone-500">{type?.kind === "bond" ? "Bond amount: " : "Coverage: "}</dt>
                  <dd className="inline tabular-nums">{money(c.coverage_cents)}</dd>
                </div>
              )}
              <div>
                <dt className="inline text-stone-500">Expires: </dt>
                <dd className="inline">{c.expires_on ? shortDate(c.expires_on) : "No expiry date"}</dd>
              </div>
              {type?.issuer && (
                <div>
                  <dt className="inline text-stone-500">Issued by: </dt>
                  <dd className="inline">{type.issuer}</dd>
                </div>
              )}
            </dl>
            {(type?.lookupUrl || type?.lookupHint) && (
              <p className="mt-1 text-sm text-stone-600">
                {type.lookupUrl ? (
                  <a href={type.lookupUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">
                    Check it yourself
                  </a>
                ) : (
                  <span className="font-semibold text-stone-800">To check it yourself:</span>
                )}{" "}
                {type.lookupHint}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
