import { escalateDispute, resolveDisputeAsCustomer, respondToDispute } from "@/app/actions/disputes";
import { PhotoField, PhotoStrip } from "@/components/photo-picker";
import { SubmitButton } from "@/components/submit-button";
import { Badge, inputCls } from "@/components/ui";
import { money, shortDate } from "@/lib/format";

export type Dispute = {
  id: string;
  milestone_id: string;
  reason: string;
  photo_paths?: string[];
  pro_response: string;
  pro_photo_paths?: string[];
  proposed_refund_cents: number | null;
  status: string;
  refund_cents: number | null;
  resolution_note: string;
  created_at: string;
  resolved_at: string | null;
};

/** Shows one dispute on a milestone, with the actions available to the viewer's side. */
export function DisputePanel({
  dispute,
  role,
  amountCents,
  viewerId,
}: {
  dispute: Dispute;
  role: "customer" | "pro";
  amountCents: number;
  /** Needed on the pro's side, so reply photos upload to their own folder. */
  viewerId?: string;
}) {
  const open = ["open", "escalated"].includes(dispute.status);
  const offer = dispute.proposed_refund_cents;

  return (
    <div
      className={`mt-2 w-full rounded-lg border p-4 text-sm ${open ? "border-red-200 bg-red-50/60" : "border-stone-200 bg-stone-50"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-stone-900">
          {open ? "Problem reported on this payment" : "Dispute closed"}
        </p>
        <span className="flex items-center gap-2">
          {dispute.status === "escalated" && <Badge tone="amber">With our team for a decision</Badge>}
          {dispute.status === "withdrawn" && <Badge>Withdrawn</Badge>}
          {dispute.status === "resolved" && <Badge tone="green">Resolved</Badge>}
          <span className="text-xs text-stone-500">{shortDate(dispute.created_at)}</span>
        </span>
      </div>

      <dl className="mt-3 space-y-3">
        <div>
          <dt className="text-xs font-medium tracking-wide text-stone-500 uppercase">
            {role === "customer" ? "What you reported" : "Customer's report"}
          </dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-stone-800">{dispute.reason}</dd>
          <PhotoStrip paths={dispute.photo_paths ?? []} />
        </div>
        {dispute.pro_response && (
          <div>
            <dt className="text-xs font-medium tracking-wide text-stone-500 uppercase">
              {role === "pro" ? "Your reply" : "The pro's reply"}
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-stone-800">{dispute.pro_response}</dd>
            <PhotoStrip paths={dispute.pro_photo_paths ?? []} />
          </div>
        )}
        {open && offer != null && (
          <div>
            <dt className="text-xs font-medium tracking-wide text-stone-500 uppercase">Refund offered</dt>
            <dd className="mt-0.5 font-semibold text-stone-900 tabular-nums">
              {money(offer)} of {money(amountCents)}
            </dd>
          </div>
        )}
        {dispute.status === "resolved" && (
          <div>
            <dt className="text-xs font-medium tracking-wide text-stone-500 uppercase">Outcome</dt>
            <dd className="mt-0.5 text-stone-800">
              {money(dispute.refund_cents ?? 0)} refunded, {money(amountCents - (dispute.refund_cents ?? 0))}{" "}
              kept by the pro. {dispute.resolution_note}
            </dd>
          </div>
        )}
      </dl>

      {open && role === "customer" && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-red-100 pt-3">
          {offer != null && (
            <form action={resolveDisputeAsCustomer}>
              <input type="hidden" name="dispute_id" value={dispute.id} />
              <input type="hidden" name="mode" value="accept_offer" />
              <SubmitButton
                small
                pendingText="Resolving…"
                confirm={`Accept a refund of ${money(offer)} and close this dispute? This cannot be undone.`}
              >
                Accept {money(offer)} refund
              </SubmitButton>
            </form>
          )}
          <form action={resolveDisputeAsCustomer}>
            <input type="hidden" name="dispute_id" value={dispute.id} />
            <input type="hidden" name="mode" value="withdraw" />
            <SubmitButton small variant="secondary" confirm="Close this dispute with no refund?">
              It&apos;s sorted, close dispute
            </SubmitButton>
          </form>
          {dispute.status === "open" && <EscalateForm id={dispute.id} />}
        </div>
      )}

      {open && role === "pro" && (
        <div className="mt-4 border-t border-red-100 pt-3">
          <form action={respondToDispute} className="space-y-2">
            <input type="hidden" name="dispute_id" value={dispute.id} />
            <textarea
              name="response"
              required
              rows={3}
              aria-label="Your reply"
              defaultValue={dispute.pro_response}
              placeholder="Your side, and how you will put it right"
              className={inputCls}
            />
            {viewerId && (
              <PhotoField userId={viewerId} folder={`disputes/${dispute.id}`} label="Add photos" />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                name="proposed_refund"
                inputMode="decimal"
                aria-label="Refund offer in dollars (optional)"
                defaultValue={offer != null ? (offer / 100).toFixed(2) : ""}
                placeholder="Refund offer $ (optional)"
                className={`${inputCls} max-w-52`}
              />
              <SubmitButton small pendingText="Sending…">
                {dispute.pro_response ? "Update reply" : "Send reply"}
              </SubmitButton>
            </div>
            <p className="text-xs text-stone-500">
              If the customer accepts your offer, that amount of the {money(amountCents)} payment is
              refunded to them from your Stripe balance.
            </p>
          </form>
          {/* A separate form: forms cannot be nested. */}
          {dispute.status === "open" && (
            <div className="mt-2">
              <EscalateForm id={dispute.id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EscalateForm({ id }: { id: string }) {
  return (
    <form action={escalateDispute}>
      <input type="hidden" name="dispute_id" value={id} />
      <SubmitButton
        small
        variant="ghost"
        confirm="Ask our team to review both sides and decide whether any of the payment is refunded?"
      >
        Ask the platform to decide
      </SubmitButton>
    </form>
  );
}
