import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing point for the links in Supabase's emails: sign-up confirmation, email change,
// and password reset.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  // A password reset asked for in this browser leaves a note saying where to go next.
  const wantsReset = request.cookies.get("auth_next")?.value === "/reset-password" || type === "recovery";
  const response = NextResponse.redirect(
    ok
      ? `${origin}${wantsReset ? "/reset-password" : "/dashboard"}`
      : `${origin}/login?error=${encodeURIComponent("That link is invalid or has expired. Try signing in.")}`,
  );
  response.cookies.delete("auth_next");
  return response;
}
