import type Stripe from "stripe";
import { fulfillCheckoutSession, syncConnectAccount, syncSubscription } from "@/lib/payments";
import { getStripe } from "@/lib/stripe";

// Stripe calls this endpoint when payments, subscriptions or connected accounts change.
// Milestone and sub-bill payments happen on the pros' own Stripe accounts, so they arrive
// through a "Connected accounts" destination and carry the account id in `event.account`.
// STRIPE_WEBHOOK_SECRET holds the signing secret. If you create two Stripe destinations
// (for example one for "Your account" events, one for "Connected accounts" events and one
// for thin Accounts v2 events), put every secret in it, separated by commas.
export async function POST(request: Request) {
  const secrets = (process.env.STRIPE_WEBHOOK_SECRET ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const signature = request.headers.get("stripe-signature");
  if (!secrets.length || !signature) {
    return new Response("Webhook is not configured", { status: 400 });
  }

  const body = await request.text();
  const stripe = getStripe();

  // Stripe sends changes to pros' accounts (Accounts v2) as "thin" events: a small notice
  // that names the account, without the data. Fetch the account and mirror its status.
  if (body.includes('"v2.core.event"')) {
    for (const secret of secrets) {
      type Notice = { type: string; related_object?: { id?: string } | null };
      let notice: Notice | null = null;
      try {
        notice = stripe.parseEventNotification(body, signature, secret) as unknown as Notice;
      } catch {
        continue; // Try the next secret.
      }
      try {
        const accountId = notice?.related_object?.id;
        if (notice?.type.startsWith("v2.core.account") && accountId) {
          await syncConnectAccount(await stripe.accounts.retrieve(accountId));
        }
      } catch (e) {
        console.error("Stripe thin event handler failed", notice?.type, e);
        return new Response("Handler error", { status: 500 });
      }
      return Response.json({ received: true });
    }
    return new Response("Invalid signature", { status: 400 });
  }
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret);
      break;
    } catch {
      // Try the next secret.
    }
  }
  if (!event) return new Response("Invalid signature", { status: 400 });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await fulfillCheckoutSession(event.data.object, event.account ?? undefined);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object);
        break;
      case "account.updated":
        await syncConnectAccount(event.data.object);
        break;
    }
  } catch (e) {
    console.error("Stripe webhook handler failed", event.type, e);
    // A 500 makes Stripe retry later.
    return new Response("Handler error", { status: 500 });
  }
  return Response.json({ received: true });
}
