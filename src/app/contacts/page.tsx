"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { auth } from "@/lib/neon-client";
import { ContactsView } from "@/components/contacts-view";
import { Spinner } from "@/components/ui";

/**
 * The signed-in surface.
 *
 * This gate is a UX convenience, not the security boundary. It stops a signed-
 * out visitor from seeing an empty shell; it does not stop anyone from reading
 * data, because there is no data to read without a valid JWT. Row Level
 * Security in Postgres is what actually protects the rows -- see the README.
 */
export default function ContactsPage() {
  const router = useRouter();
  const { data: session, isPending } = auth.useSession();

  React.useEffect(() => {
    if (!isPending && !session?.user) {
      router.replace("/sign-in");
    }
  }, [isPending, session, router]);

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner className="size-6 text-ink-subtle" />
        <span className="sr-only">Loading your session</span>
      </div>
    );
  }

  if (!session?.user) {
    // The effect above is already redirecting; render nothing in the meantime.
    return null;
  }

  return (
    <ContactsView userName={session.user.name || session.user.email || "you"} />
  );
}
