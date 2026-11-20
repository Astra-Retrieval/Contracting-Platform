"use client";

import { useRef, useState, useTransition } from "react";
import { addCredential } from "@/app/actions/credentials";
import { Field, buttonCls, inputCls } from "@/components/ui";
import { CREDENTIAL_TYPES } from "@/lib/credentials";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 10 * 1024 * 1024;
const KIND_LABELS = { license: "Licenses and registrations", insurance: "Insurance", bond: "Bonds", certification: "Certifications" };

/**
 * Uploads a license, insurance certificate, bond, or certification. The file goes straight
 * from the browser into the pro's private folder; the details are then saved by the server.
 */
export function CredentialForm({ userId, suggested }: { userId: string; suggested?: string }) {
  const [typeId, setTypeId] = useState(suggested ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const type = CREDENTIAL_TYPES.find((t) => t.id === typeId);

  function submit(formData: FormData) {
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!type) return setError("Choose what kind of document this is.");
    if (!file) return setError("Choose the file to upload: a photo or PDF of the document.");
    if (file.size > MAX_BYTES) return setError("That file is larger than 10 MB.");
    if (!/^(application\/pdf|image\/(jpeg|png|webp|heic))$/.test(file.type)) {
      return setError("Upload a PDF or a photo (JPG, PNG, WebP, or HEIC).");
    }
    startTransition(async () => {
      const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${userId}/${type.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await createClient()
        .storage.from("credentials")
        .upload(path, file, { contentType: file.type });
      if (uploadError) return setError(uploadError.message);
      formData.set("file_path", path);
      formData.delete("file");
      await addCredential(formData);
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <Field label="What is this document?">
        <select name="type" required value={typeId} onChange={(e) => setTypeId(e.target.value)} className={inputCls}>
          <option value="">Choose a document type</option>
          {(Object.keys(KIND_LABELS) as (keyof typeof KIND_LABELS)[]).map((kind) => (
            <optgroup key={kind} label={KIND_LABELS[kind]}>
              {CREDENTIAL_TYPES.filter((t) => t.kind === kind).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      {type && <p className="rounded-lg bg-brand-50 p-3 text-sm text-stone-700">{type.help}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={type?.kind === "insurance" ? "Policy number" : type?.kind === "bond" ? "Bond number" : "License or registration number"}
          hint="Exactly as printed. Customers use it to look you up."
        >
          <input name="number" maxLength={60} required={type?.kind === "license"} className={inputCls} />
        </Field>
        <Field label="Name on the document" hint="The person or business it was issued to.">
          <input name="holder_name" maxLength={120} required className={inputCls} />
        </Field>
        <Field label={type?.kind === "insurance" ? "Insurance company" : "Classification (if any)"} hint={type?.kind === "license" ? "e.g. Roofer, Electrical, Group 3" : undefined}>
          <input name="classification" maxLength={120} className={inputCls} />
        </Field>
        <Field label="Expiry date" hint="Leave empty only if the document never expires.">
          <input name="expires_on" type="date" className={inputCls} />
        </Field>
        {type?.hasCoverage && (
          <Field label="Coverage amount ($)" hint="Per occurrence for insurance, or the bond amount.">
            <input name="coverage" inputMode="decimal" placeholder="e.g. 1,000,000" className={inputCls} />
          </Field>
        )}
        <Field label="The document" hint="A clear photo or PDF, up to 10 MB. Only you and Crew Orchard staff can open the file.">
          <input
            ref={fileRef}
            name="file"
            type="file"
            required
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
            className="block w-full text-sm text-stone-700 file:mr-3 file:rounded-md file:border file:border-stone-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
        </Field>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button disabled={busy} className={buttonCls("primary")}>
          {busy ? "Uploading…" : "Add document"}
        </button>
      </div>
    </form>
  );
}
