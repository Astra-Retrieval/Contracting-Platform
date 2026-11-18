import type Stripe from "stripe";
import { fulfillCheckoutSession, syncConnectAccount, syncSubscription } from "@/lib/payments";
import { getStripe } from "@/lib/stripe";

// Stripe calls this endpoint when payments, subscriptions or connected accounts change.
// Milestone and sub-bill payments happen on the pros' own Stripe accounts, so they arrive
// through a "Connected accounts" destination and carry the account id in `event.account`.
// STRIPE_WEBHOOK_SECRET holds the signing secret. If you create two Stripe destinations
// (one for "Your account" events, one for "Connected accounts" events such as
// account.updated), put both secrets in it, separated by a comma.
export async function POST(request: Request) {
  const secrets = (process.env.STRIPE_WEBHOOK_SECRET ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const signature = request.headers.get("stripe-signature");
  if (!secrets.length || !signature) {
    return new Response("Webhook is not configured", { status: 400 });
  }

  const body = await request.text();
  const stripe = getStripe();
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
