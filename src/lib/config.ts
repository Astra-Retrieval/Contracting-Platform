// One place for the things most likely to change: name, pricing, fees.

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Trade Platform";
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

/** Platform cut of every milestone payment, in basis points (500 = 5%). */
export const PLATFORM_FEE_BPS = 500;
/** Monthly pro subscription, in cents. */
export const PRO_MONTHLY_PRICE_CENTS = 2900;
/** Free trial length for new pro subscriptions. */
export const TRIAL_DAYS = 30;

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Stripe's card processing fee, used only for estimates shown before a payment is made.
 * The real fee is read from Stripe when the payment succeeds and is what gets deducted.
 */
export const PROCESSING_FEE_BPS = 290;
export const PROCESSING_FEE_FIXED_CENTS = 30;

/** Our cut. Stripe's processing fee is separate and comes out of the pro's payout too. */
export const platformFee = (amountCents: number) =>
  Math.round((amountCents * PLATFORM_FEE_BPS) / 10000);
/** Estimated Stripe fee on an amount paid in `payments` separate card payments. */
export const estimatedProcessingFee = (amountCents: number, payments = 1) =>
  amountCents > 0
    ? Math.round((amountCents * PROCESSING_FEE_BPS) / 10000) + PROCESSING_FEE_FIXED_CENTS * payments
    : 0;
export const processingFeeLabel = `${PROCESSING_FEE_BPS / 100}% + ${PROCESSING_FEE_FIXED_CENTS}¢`;
export const feePercentLabel = `${PLATFORM_FEE_BPS / 100}%`;
