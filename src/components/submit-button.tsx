"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonCls, cn } from "@/components/ui";

type Variant = Parameters<typeof buttonCls>[0];

/** Submit button that disables itself while its form's server action runs. */
export function SubmitButton({
  children,
  variant = "primary",
  small,
  className,
  pendingText,
  confirm,
  name,
  value,
}: {
  children: ReactNode;
  variant?: Variant;
  small?: boolean;
  className?: string;
  pendingText?: string;
  /** If set, ask the user to confirm before submitting. */
  confirm?: string;
  /** Sent with the form, to tell several submit buttons apart. */
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={cn(buttonCls(variant, small), className)}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}
