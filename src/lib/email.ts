import { APP_NAME, APP_URL } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";

// Transactional email through Resend's HTTP API (no SDK needed).
// Sending never throws: a failed or unconfigured email must not break the action that
// triggered it. Without RESEND_API_KEY the message is logged instead.

export const isEmailConfigured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

type Mail = {
  subject: string;
  /** Plain sentences. Each entry becomes a paragraph. */
  lines: string[];
  /** Path on this site the button links to, e.g. /projects/123. */
  path?: string;
  cta?: string;
};

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function render({ lines, path, cta }: Mail) {
  const url = path ? `${APP_URL}${path}` : APP_URL;
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const html = `<!doctype html><html><body style="margin:0;background:#f2faf4;font-family:${font};color:#12281b">
<div style="max-width:480px;margin:0 auto;padding:32px 16px">
  <p style="font-weight:700;font-size:20px;margin:0 0 20px;text-align:center;color:#234a32">${escape(APP_NAME)}</p>
  <div style="background:#ffffff;border:1px solid #c6e9cf;border-radius:16px;padding:32px 28px">
    ${lines.map((l) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#2c5d3e">${escape(l)}</p>`).join("")}
    <a href="${url}" style="display:inline-block;margin-top:8px;background:#37774d;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:10px">${escape(cta ?? "Open " + APP_NAME)}</a>
  </div>
  <p style="margin:20px 0 0;font-size:12px;line-height:1.6;text-align:center;color:#4a9663">You are receiving this because of activity on your ${escape(APP_NAME)} account.</p>
</div></body></html>`;
  const text = `${lines.join("\n\n")}\n\n${cta ?? "Open " + APP_NAME}: ${url}`;
  return { html, text };
}

async function send(to: string, mail: Mail) {
  if (!isEmailConfigured) {
    console.info(`[email off] to=${to} subject="${mail.subject}"`);
    return;
  }
  try {
    const { html, text } = render(mail);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject: mail.subject, html, text }),
    });
    if (!res.ok) console.error("Email failed", res.status, await res.text());
  } catch (e) {
    console.error("Email failed", e);
  }
}

/** Email one member, looked up by user id. */
export async function notify(userId: string | null | undefined, mail: Mail) {
  if (!userId) return;
  try {
    const { data } = await createAdminClient().auth.admin.getUserById(userId);
    const to = data.user?.email;
    if (to) await send(to, mail);
  } catch (e) {
    console.error("Could not look up email recipient", e);
  }
}

/** Display name for emails: business name for pros, otherwise the person's name. */
export async function displayName(userId: string) {
  const admin = createAdminClient();
  const [{ data: pro }, { data: person }] = await Promise.all([
    admin.from("pro_profiles").select("business_name").eq("user_id", userId).maybeSingle(),
    admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  return pro?.business_name || person?.full_name || "A member";
}

export async function projectTitle(projectId: string) {
  const { data } = await createAdminClient()
    .from("projects")
    .select("title")
    .eq("id", projectId)
    .maybeSingle();
  return data?.title ?? "your project";
}

/** Email platform staff (ADMIN_EMAIL), used for disputes. */
export async function notifyAdmin(mail: Mail) {
  const to = process.env.ADMIN_EMAIL;
  if (to) await send(to, mail);
  else console.info(`[admin email off] subject="${mail.subject}"`);
}
