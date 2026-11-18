"use client";

import { useRef, useState, useTransition } from "react";
import { buttonCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Uploads images straight from the browser to Supabase Storage (under the user's own
 * folder), then hands each stored path to a server action that records it.
 */
export function PhotoUploader({
  userId,
  folder,
  onUploaded,
  label = "Add photos",
}: {
  userId: string;
  folder: string;
  onUploaded: (path: string) => Promise<void>;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          setError("Only image files can be uploaded.");
          continue;
        }
        if (file.size > MAX_BYTES) {
          setError(`${file.name} is larger than 8 MB.`);
          continue;
        }
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("photos")
          .upload(path, file, { contentType: file.type });
        if (uploadError) {
          setError(uploadError.message);
          continue;
        }
        await onUploaded(path);
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        type="button"
        disabled={busy}
        className={buttonCls("secondary", true)}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Uploading…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
