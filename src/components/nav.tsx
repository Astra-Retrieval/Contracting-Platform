import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { ButtonLink, buttonCls } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

const customerLinks = [
  ["/dashboard", "Dashboard"],
  ["/projects", "My projects"],
  ["/pros", "Find pros"],
  ["/messages", "Messages"],
];
const proLinks = [
  ["/dashboard", "Dashboard"],
  ["/pro/jobs", "Leads & jobs"],
  ["/pro/subs", "Subs"],
  ["/pros", "Find pros"],
  ["/messages", "Messages"],
  ["/pro/profile", "Profile"],
  ["/pro/billing", "Billing"],
];

async function unreadCount(viewerId: string) {
  const supabase = await createClient();
  // Row-level security already limits this to the viewer's conversations.
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .neq("sender_id", viewerId)
    .is("read_at", null);
  return count ?? 0;
}

export async function Nav() {
  const viewer = await getViewer();
  const links = viewer
    ? [...(viewer.role === "pro" ? proLinks : customerLinks), ...(viewer.isAdmin ? [["/admin/disputes", "Disputes"]] : [])]
    : [["/pros", "Find pros"]];
  const unread = viewer ? await unreadCount(viewer.id) : 0;

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-stone-900">
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-md bg-orange-600 text-sm text-white"
          >
            ▲
          </span>
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
              {href === "/messages" && unread > 0 && (
                <span className="ml-1.5 rounded-full bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {viewer ? (
            <>
              <span className="hidden text-sm text-stone-600 sm:inline">
                {viewer.fullName || viewer.email}
              </span>
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
          © {new Date().getFullYear()} {APP_NAME}
        </span>
        <span className="flex gap-4">
          <Link href="/pros" className="hover:text-stone-800">
            Find pros
          </Link>
          <Link href="/signup?role=pro" className="hover:text-stone-800">
            Join as a pro
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
