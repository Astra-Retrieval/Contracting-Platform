"use client";

import { useRef, useState, useTransition } from "react";
import { buttonCls } from "@/components/ui";
import { photoUrl } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Pick photos to send with something that has not been saved yet (a new project, a
 * message, a dispute). Each photo uploads straight to the user's own storage folder; the
 * stored paths are handed to the parent, which sends them along when the form is submitted.
 */
export function PhotoPicker({
  userId,
  folder,
  paths,
  onChange,
  max = 6,
  label = "Add photos",
  compact = false,
}: {
  userId: string;
  folder: string;
  paths: string[];
  onChange: (paths: string[]) => void;
  max?: number;
  label?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const added: string[] = [];
      for (const file of Array.from(files)) {
        if (paths.length + added.length >= max) {
          setError(`You can add up to ${max} photos.`);
          break;
        }
        if (!file.type.startsWith("image/")) {
          setError("Only image files can be added.");
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
        if (uploadError) setError(uploadError.message);
        else added.push(path);
      }
      if (added.length) onChange([...paths, ...added]);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function remove(path: string) {
    onChange(paths.filter((p) => p !== path));
    // Best effort: the photo was never attached to anything, so drop the file too.
    void createClient().storage.from("photos").remove([path]);
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
      <div className="flex flex-wrap items-center gap-2">
        {paths.map((p) => (
          <div key={p} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl(p)}
              alt="Photo to send"
              className={`${compact ? "size-12" : "size-20"} rounded-lg border border-stone-200 object-cover`}
            />
            <button
              type="button"
              onClick={() => remove(p)}
              aria-label="Remove photo"
              className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-stone-800 text-xs leading-none text-white hover:bg-red-700"
            >
              ×
            </button>
          </div>
        ))}
        {paths.length < max && (
          <button
            type="button"
            disabled={busy}
            className={buttonCls("secondary", true)}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Uploading…" : label}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

/** PhotoPicker for a plain form: the chosen photos are submitted as `photo_path` fields. */
export function PhotoField(props: {
  userId: string;
  folder: string;
  max?: number;
  label?: string;
  compact?: boolean;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  return (
    <div>
      {paths.map((p) => (
        <input key={p} type="hidden" name="photo_path" value={p} />
      ))}
      <PhotoPicker {...props} paths={paths} onChange={setPaths} />
    </div>
  );
}

/** Thumbnails that open the full photo. For server or client components. */
export function PhotoStrip({ paths, size = "size-20" }: { paths: string[]; size?: string }) {
  if (!paths.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {paths.map((p) => (
        <a
          key={p}
          href={photoUrl(p)}
          target="_blank"
          rel="noreferrer"
          className={`block ${size} overflow-hidden rounded-lg border border-stone-200`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(p)} alt="Attached photo" className="size-full object-cover" />
        </a>
      ))}
    </div>
  );
}
