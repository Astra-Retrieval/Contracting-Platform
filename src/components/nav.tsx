import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { ButtonLink, buttonCls } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { APP_NAME, LAUNCH_STATE_NAME } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

const customerLinks = [
  ["/dashboard", "Dashboard"],
  ["/projects", "My projects"],
  ["/pros", "Find pros"],
  ["/messages", "Messages"],
];
const proLinks = [
  ["/dashboard", "Dashboard"],
  ["/pro/find-work", "Find work"],
  ["/pro/jobs", "Leads & jobs"],
  ["/pro/subs", "Subs"],
  ["/pros", "Find pros"],
  ["/messages", "Messages"],
  ["/pro/profile", "Profile"],
  ["/pro/credentials", "Licenses"],
  ["/pro/billing", "Billing"],
];

const badgeCls = "ml-1.5 rounded-full bg-brand-300 px-1.5 py-0.5 text-[10px] font-bold text-brand-950";

// The counts load on their own, so a slow count never holds up the page.
async function UnreadBadge({ viewerId }: { viewerId: string }) {
  const supabase = await createClient();
  // Row-level security already limits this to the viewer's conversations.
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .neq("sender_id", viewerId)
    .is("read_at", null);
  return count ? <span className={badgeCls}>{count}</span> : null;
}

/** Quote requests a pro has not answered yet. */
async function NewRequestsBadge({ viewerId }: { viewerId: string }) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("quote_requests")
    .select("id", { count: "exact", head: true })
    .eq("pro_id", viewerId)
    .eq("status", "pending")
    .eq("source", "customer");
  return count ? <span className={badgeCls}>{count}</span> : null;
}

export async function Nav() {
  const viewer = await getViewer();
  const links = viewer
    ? [...(viewer.role === "pro" ? proLinks : customerLinks), ...(viewer.isAdmin ? [["/admin", "Staff"]] : [])]
    : [["/pros", "Find pros"]];

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-stone-900">
          <Logo />
          {APP_NAME}
        </Link>
        <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto text-sm md:order-none md:w-auto md:flex-1">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-md px-2.5 py-1.5 font-medium whitespace-nowrap text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            >
              {label}
              {viewer && href === "/messages" && (
                <Suspense fallback={null}>
                  <UnreadBadge viewerId={viewer.id} />
                </Suspense>
              )}
              {viewer && href === "/pro/jobs" && (
                <Suspense fallback={null}>
                  <NewRequestsBadge viewerId={viewer.id} />
                </Suspense>
              )}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {viewer ? (
            <>
              <Link
                href="/settings"
                className="rounded-md px-2 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              >
                Settings
              </Link>
              <form action={signOut}>
                <button className={buttonCls("secondary", true)}>Sign out</button>
              </form>
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" small>
                Sign in
              </ButtonLink>
              <ButtonLink href="/signup" small>
                Get started
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-stone-500">
        <span>
          © {new Date().getFullYear()} {APP_NAME}, an Astra Retrieval company. Now serving{" "}
          {LAUNCH_STATE_NAME}.
        </span>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/pros" className="hover:text-stone-800">
            Find pros
          </Link>
          <Link href="/signup?role=pro" className="hover:text-stone-800">
            Join as a pro
          </Link>
          <Link href="/waitlist" className="hover:text-stone-800">
            Pro waitlist
          </Link>
          <Link href="/feedback" className="hover:text-stone-800">
            Request a feature
          </Link>
          <Link href="/terms" className="hover:text-stone-800">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-stone-800">
            Privacy
          </Link>
        </span>
      </div>
    </footer>
  );
}
