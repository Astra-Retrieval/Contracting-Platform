import { redirect } from "next/navigation";
import { SUPABASE_URL } from "@/lib/config";

export function money(cents: number | null | undefined) {
  const value = (cents ?? 0) / 100;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** "1,250.50" or "$1250" typed into a form -> cents. Returns 0 for anything unreadable. */
export function toCents(value: FormDataEntryValue | null | undefined) {
  const n = parseFloat(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function toInt(value: FormDataEntryValue | null | undefined) {
  const n = parseInt(String(value ?? "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export const text = (value: FormDataEntryValue | null | undefined) => String(value ?? "").trim();

export function shortDate(value: string | null | undefined) {
  if (!value) return "";
  // Date-only strings are parsed as UTC; show them in UTC so the day doesn't shift.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  });
}

export const photoUrl = (path: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/photos/${path}`;

export function rateRange(min: number | null, max: number | null, suffix = "") {
  const f = (n: number) => `$${n.toLocaleString("en-US")}`;
  if (min && max && min !== max) return `${f(min)}–${f(max)}${suffix}`;
  if (min || max) return `${f((min || max) as number)}${suffix}`;
  return "";
}

/** Redirect back to a page with a message shown by <Flash />. */
export function flash(path: string, kind: "error" | "notice", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

/** Photo paths sent with a form. Only paths inside the sender's own storage folder count. */
export function photoPaths(formData: FormData, userId: string, max = 6) {
  return ownPhotoPaths(formData.getAll("photo_path").map(String), userId, max);
}
export function ownPhotoPaths(paths: string[], userId: string, max = 6) {
  return [...new Set(paths)]
    .filter((p) => p.startsWith(`${userId}/`) && !p.includes("..") && p.length < 300)
    .slice(0, max);
}
