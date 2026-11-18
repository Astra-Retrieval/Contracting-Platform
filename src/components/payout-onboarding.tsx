"use client";

import { loadConnectAndInitialize } from "@stripe/connect-js";
import { ConnectAccountOnboarding, ConnectComponentsProvider } from "@stripe/react-connect-js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { payoutSetupClientSecret } from "@/app/actions/payments";

/** Stripe's account setup form, shown inside the site. Stripe collects and stores the details. */
export function PayoutOnboarding({ publishableKey }: { publishableKey: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Created once per visit; Stripe asks for a fresh secret whenever it needs one.
  const [connect] = useState(() =>
    loadConnectAndInitialize({
      publishableKey,
      fetchClientSecret: async () => {
        try {
          return await payoutSetupClientSecret();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not load the setup form.");
          return "";
        }
      },
      appearance: {
        variables: { colorPrimary: "#4a9663", colorText: "#1c1917", borderRadius: "8px" },
      },
    }),
  );

  if (error) {
    return <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>;
  }
  return (
    <ConnectComponentsProvider connectInstance={connect}>
      <ConnectAccountOnboarding onExit={() => router.replace("/pro/billing?connect=return")} />
    </ConnectComponentsProvider>
  );
}
