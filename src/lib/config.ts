// One place for the things most likely to change: name, pricing, fees.

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Crew Orchard";
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

/** Platform cut of every milestone payment, in basis points (500 = 5%). */
export const PLATFORM_FEE_BPS = 500;
/**
 * Platform cut of a bill a lead contractor pays a sub. 0 = nothing: the platform fee is
 * charged once, on what the customer pays the lead.
 */
export const SUB_BILL_FEE_BPS = 0;
/** Monthly pro subscription, in cents. */
export const PRO_MONTHLY_PRICE_CENTS = 2900;
/** Free trial length for new pro subscriptions. */
export const TRIAL_DAYS = 30;

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Stripe's card processing fee, used only for estimates shown to pros. Stripe takes the
 * real fee from the pro's own Stripe account; the platform never handles it.
 */
export const PROCESSING_FEE_BPS = 290;
export const PROCESSING_FEE_FIXED_CENTS = 30;

/** Our cut of a milestone payment. Stripe's processing fee is separate and is also paid by the pro. */
export const platformFee = (amountCents: number) =>
  Math.round((amountCents * PLATFORM_FEE_BPS) / 10000);
/** Our cut of a sub's bill. */
export const subBillFee = (amountCents: number) =>
  Math.round((amountCents * SUB_BILL_FEE_BPS) / 10000);
export const subBillFeeLabel = `${SUB_BILL_FEE_BPS / 100}%`;
/** Estimated Stripe fee on an amount paid in `payments` separate card payments. */
export const estimatedProcessingFee = (amountCents: number, payments = 1) =>
  amountCents > 0
    ? Math.round((amountCents * PROCESSING_FEE_BPS) / 10000) + PROCESSING_FEE_FIXED_CENTS * payments
    : 0;
export const processingFeeLabel = `${PROCESSING_FEE_BPS / 100}% + ${PROCESSING_FEE_FIXED_CENTS}¢`;
export const feePercentLabel = `${PLATFORM_FEE_BPS / 100}%`;

/** Where the platform is open first. Pros elsewhere are pointed to the waitlist. */
export const LAUNCH_STATES: Record<string, string> = { SC: "South Carolina" };
export const isLaunchState = (code: string) => code.toUpperCase() in LAUNCH_STATES;
/** "South Carolina", or "A and B" once there are more, for sentences. */
export const LAUNCH_STATE_NAME = Object.values(LAUNCH_STATES)
  .join(", ")
  .replace(/, ([^,]*)$/, Object.keys(LAUNCH_STATES).length > 2 ? ", and $1" : " and $1");
