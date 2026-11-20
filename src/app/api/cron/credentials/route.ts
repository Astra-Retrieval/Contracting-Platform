import { NextResponse, type NextRequest } from "next/server";
import { credentialType } from "@/lib/credentials";
import { refreshDocsStatus } from "@/lib/credentials-server";
import { notify, notifyAdmin } from "@/lib/email";
import { shortDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

// Runs once a day (see vercel.json). Vercel sends the CRON_SECRET with each scheduled call.
//   1. A month before a document expires: email the pro and put it in the staff queue.
//   2. On the day after it expires: mark it expired, email the pro, and recalculate the
//      warning on their profile.
export const dynamic = "force-dynamic";
const REMIND_DAYS = 30;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + REMIND_DAYS * 86400000).toISOString().slice(0, 10);
  const label = (type: string) => credentialType(type)?.label ?? "document";

  // 1. Expiring within a month, not yet reminded.
  const { data: expiring } = await admin
    .from("pro_credentials")
    .select("id, pro_id, type, expires_on")
    .in("status", ["pending", "verified"])
    .gte("expires_on", today)
    .lte("expires_on", soon)
    .is("reminded_at", null)
    .limit(500);
  for (const c of expiring ?? []) {
    await notify(c.pro_id, {
      subject: `Your ${label(c.type)} expires on ${shortDate(c.expires_on)}`,
      lines: [
        `Your ${label(c.type)} on Crew Orchard expires on ${shortDate(c.expires_on)}.`,
        "Upload the renewed document before then. If it lapses, your profile and quotes show a warning that you have not provided proof of license.",
      ],
      path: "/pro/credentials",
      cta: "Upload the renewal",
    });
    await admin.from("pro_credentials").update({ reminded_at: new Date().toISOString() }).eq("id", c.id);
  }

  // 2. Past the expiry date.
  const { data: lapsed } = await admin
    .from("pro_credentials")
    .select("id, pro_id, type, expires_on")
    .in("status", ["pending", "verified"])
    .lt("expires_on", today)
    .limit(500);
  for (const c of lapsed ?? []) {
    await admin
      .from("pro_credentials")
      .update({ status: "expired", expiry_notified_at: new Date().toISOString() })
      .eq("id", c.id);
    await notify(c.pro_id, {
      subject: `Your ${label(c.type)} has expired`,
      lines: [
        `Your ${label(c.type)} expired on ${shortDate(c.expires_on)}, so it no longer counts on Crew Orchard.`,
        "Upload the current document to clear the warning on your profile and quotes.",
      ],
      path: "/pro/credentials",
      cta: "Upload a document",
    });
  }
  for (const proId of new Set((lapsed ?? []).map((c) => c.pro_id))) await refreshDocsStatus(proId, admin);

  const reminded = expiring?.length ?? 0;
  const expired = lapsed?.length ?? 0;
  if (reminded || expired) {
    await notifyAdmin({
      subject: `Documents: ${reminded} expiring soon, ${expired} expired today`,
      lines: [
        `${reminded} document(s) expire within ${REMIND_DAYS} days; the pros were reminded.`,
        `${expired} document(s) passed their expiry date and were marked expired.`,
        "Re-check renewals as pros upload them.",
      ],
      path: "/admin/credentials",
      cta: "Open documents",
    });
  }
  return NextResponse.json({ reminded, expired });
}
