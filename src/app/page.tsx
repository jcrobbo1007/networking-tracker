"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useSessionGate } from "@/lib/neon-client";
import { Spinner } from "@/components/ui";

/** Send people to the right place: their contacts, or the sign-in screen. */
export default function HomePage() {
  const router = useRouter();
  const { settled, user } = useSessionGate();

  React.useEffect(() => {
    if (!settled) return;
    router.replace(user ? "/contacts" : "/sign-in");
  }, [settled, user, router]);

  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Spinner className="size-6 text-ink-subtle" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
