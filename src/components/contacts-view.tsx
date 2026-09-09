"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { auth, getAccessToken } from "@/lib/neon-client";
import {
  Alert,
  Button,
  Card,
  ContactsSkeleton,
  EmptyState,
  Input,
  PriorityBadge,
  Select,
  cx,
} from "@/components/ui";
import { ContactFormDialog, type ContactDraft } from "@/components/contact-form";
import {
  PRIORITIES,
  SORT_FIELDS,
  type Contact,
  type SortDirection,
  type SortField,
} from "@/lib/validation";

type Status =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

const SORT_LABELS: Record<SortField, string> = {
  created_at: "Date added",
  name: "Name",
  company: "Company",
  priority: "Priority",
};

/** Every request carries the caller's JWT; the API route forwards it to Neon. */
function withToken(token: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      ...init.headers,
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
  };
}

async function authedFetch(input: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("NO_SESSION");
  return fetch(input, withToken(token, init));
}

export function ContactsView({ userName }: { userName: string }) {
  const router = useRouter();

  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [status, setStatus] = React.useState<Status>({ kind: "loading" });
  const [notice, setNotice] = React.useState<string | null>(null);

  const [sort, setSort] = React.useState<SortField>("created_at");
  const [direction, setDirection] = React.useState<SortDirection>("desc");
  const [priorityFilter, setPriorityFilter] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Contact | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
  const [signingOut, setSigningOut] = React.useState(false);

  // Debounce the search box so typing does not fire a request per keystroke.
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Bumping this re-runs the fetch below. Mutations bump it instead of calling
  // a shared loader, which keeps a single code path responsible for filling the
  // list -- there is no second place that can set `contacts`.
  const [reloadToken, setReloadToken] = React.useState(0);
  const reload = React.useCallback(() => setReloadToken((n) => n + 1), []);

  React.useEffect(() => {
    // React's documented fetch-in-an-effect pattern. `cancelled` matters here:
    // typing in the search box fires overlapping requests, and without this an
    // earlier, slower response could land after a later one and show stale
    // results for the current query.
    let cancelled = false;

    async function fetchContacts() {
      try {
        const token = await getAccessToken();
        if (cancelled) return;

        if (!token) {
          router.push("/sign-in");
          return;
        }

        const params = new URLSearchParams({ sort, direction });
        if (priorityFilter !== "all") params.set("priority", priorityFilter);
        if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());

        const response = await fetch(`/api/contacts?${params}`, withToken(token));
        if (cancelled) return;

        if (response.status === 401) {
          router.push("/sign-in");
          return;
        }

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          if (cancelled) return;
          setStatus({
            kind: "error",
            message: body.error ?? "Could not load your contacts.",
          });
          return;
        }

        const body = await response.json();
        if (cancelled) return;

        setContacts(body.contacts ?? []);
        setStatus({ kind: "ready" });
      } catch (cause) {
        if (cancelled) return;
        console.error(cause);
        setStatus({
          kind: "error",
          message:
            "Could not reach the server. Check your connection and try again.",
        });
      }
    }

    void fetchContacts();
    return () => {
      cancelled = true;
    };
  }, [sort, direction, priorityFilter, debouncedSearch, reloadToken, router]);

  // Auto-dismiss the success banner so it does not pile up.
  React.useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Stable identity so the dialog's Escape-key effect does not re-subscribe.
  const handleCloseDialog = React.useCallback(() => setDialogOpen(false), []);

  async function handleSubmit(draft: ContactDraft) {
    const isEdit = editing !== null;
    const payload = {
      name: draft.name,
      company: draft.company,
      role: draft.role,
      where_met: draft.where_met,
      notes: draft.notes,
      priority: draft.priority,
    };

    try {
      const response = await authedFetch(
        isEdit ? `/api/contacts/${editing.id}` : "/api/contacts",
        { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );

      if (response.status === 401) {
        router.push("/sign-in");
        return { ok: false as const, error: "Your session expired." };
      }

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          ok: false as const,
          error: body.error ?? "Could not save this contact.",
          fieldErrors: body.fieldErrors,
        };
      }

      setNotice(isEdit ? "Contact updated." : "Contact added.");
      reload();
      return { ok: true as const };
    } catch (cause) {
      console.error(cause);
      return {
        ok: false as const,
        error: "Could not reach the server. Check your connection and try again.",
      };
    }
  }

  async function handleDelete(contact: Contact) {
    if (
      !window.confirm(
        `Delete ${contact.name}? This cannot be undone.`,
      )
    ) {
      return;
    }

    setPendingDelete(contact.id);
    try {
      const response = await authedFetch(`/api/contacts/${contact.id}`, {
        method: "DELETE",
      });

      if (response.status === 401) {
        router.push("/sign-in");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setStatus({
          kind: "error",
          message: body.error ?? "Could not delete this contact.",
        });
        return;
      }

      // Optimistic removal, then reload to stay authoritative.
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      setNotice("Contact deleted.");
      reload();
    } catch (cause) {
      console.error(cause);
      setStatus({
        kind: "error",
        message: "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      setPendingDelete(null);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await auth.signOut();
      router.push("/sign-in");
      router.refresh();
    } catch (cause) {
      console.error(cause);
      setSigningOut(false);
    }
  }

  const hasFilters = priorityFilter !== "all" || debouncedSearch.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Header ---------------------------------------------------------- */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Networking tracker
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Signed in as {userName}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={handleSignOut} loading={signingOut}>
          Sign out
        </Button>
      </header>

      {notice && (
        <div className="mt-4">
          <Alert tone="success" onDismiss={() => setNotice(null)}>
            {notice}
          </Alert>
        </div>
      )}

      {/* Controls -------------------------------------------------------- */}
      <div className="mt-6 flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, notes..."
            aria-label="Search contacts"
            className="flex-1"
          />
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <span aria-hidden="true">+</span>
            <span className="hidden sm:inline">Add contact</span>
            <span className="sr-only sm:hidden">Add contact</span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Fixed-width wrappers rather than w-auto on the control itself:
              the control's own w-full and a w-auto override have equal CSS
              specificity, so which one wins would depend on stylesheet order. */}
          <label htmlFor="filter-priority" className="sr-only">
            Filter by priority
          </label>
          <div className="w-44">
            <Select
              id="filter-priority"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="all">All priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)} priority
                </option>
              ))}
            </Select>
          </div>

          <label htmlFor="sort-field" className="sr-only">
            Sort by
          </label>
          <div className="w-48">
            <Select
              id="sort-field"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortField)}
            >
              {SORT_FIELDS.map((field) => (
                <option key={field} value={field}>
                  Sort: {SORT_LABELS[field]}
                </option>
              ))}
            </Select>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDirection((d) => (d === "asc" ? "desc" : "asc"))}
            aria-label={`Sort ${direction === "asc" ? "descending" : "ascending"}`}
          >
            {direction === "asc" ? "Ascending" : "Descending"}
          </Button>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPriorityFilter("all");
                setSearch("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* List ------------------------------------------------------------ */}
      <Card className="mt-4 overflow-hidden">
        {status.kind === "loading" && <ContactsSkeleton />}

        {status.kind === "error" && (
          <div className="p-4 sm:p-6">
            <Alert tone="danger" title="Something went wrong">
              <p>{status.message}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={reload}
              >
                Try again
              </Button>
            </Alert>
          </div>
        )}

        {status.kind === "ready" && contacts.length === 0 && (
          <EmptyState
            title={hasFilters ? "No contacts match those filters" : "No contacts yet"}
            description={
              hasFilters
                ? "Try a different search term or clear the filters."
                : "Add the first person you want to stay connected with."
            }
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setPriorityFilter("all");
                    setSearch("");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                  Add contact
                </Button>
              )
            }
          />
        )}

        {status.kind === "ready" && contacts.length > 0 && (
          <>
            {/* Table on desktop, stacked cards on mobile. Same data, one source. */}
            <ul className="divide-y divide-border">
              {contacts.map((contact) => (
                <li
                  key={contact.id}
                  className={cx(
                    "flex flex-col gap-3 px-4 py-4 transition-opacity sm:flex-row sm:items-start sm:gap-4 sm:px-6",
                    pendingDelete === contact.id && "opacity-50",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{contact.name}</span>
                      <PriorityBadge priority={contact.priority} />
                    </div>

                    {(contact.role || contact.company) && (
                      <p className="mt-0.5 truncate text-sm text-ink-muted">
                        {[contact.role, contact.company].filter(Boolean).join(" · ")}
                      </p>
                    )}

                    {contact.where_met && (
                      <p className="mt-1 text-sm text-ink-subtle">
                        Met at {contact.where_met}
                      </p>
                    )}

                    {contact.notes && (
                      <p className="mt-2 text-sm whitespace-pre-wrap text-ink-muted">
                        {contact.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditing(contact);
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={pendingDelete === contact.id}
                      onClick={() => void handleDelete(contact)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <p className="border-t border-border px-4 py-3 text-sm text-ink-subtle sm:px-6">
              {contacts.length} {contacts.length === 1 ? "contact" : "contacts"}
              {hasFilters && " matching your filters"}
            </p>
          </>
        )}
      </Card>

      {/* Mounted only while open, keyed per contact, so each open starts from
          fresh state without an effect syncing props into state. */}
      {dialogOpen && (
        <ContactFormDialog
          key={editing?.id ?? "new"}
          contact={editing}
          onClose={handleCloseDialog}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
