"use client";

import * as React from "react";

import {
  Alert,
  Button,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import {
  PRIORITIES,
  validateContactInput,
  type Contact,
} from "@/lib/validation";

export type ContactDraft = {
  name: string;
  company: string;
  role: string;
  where_met: string;
  notes: string;
  priority: string;
};

const EMPTY: ContactDraft = {
  name: "",
  company: "",
  role: "",
  where_met: "",
  notes: "",
  priority: "medium",
};

function draftFrom(contact: Contact | null): ContactDraft {
  if (!contact) return EMPTY;
  return {
    name: contact.name ?? "",
    company: contact.company ?? "",
    role: contact.role ?? "",
    where_met: contact.where_met ?? "",
    notes: contact.notes ?? "",
    priority: contact.priority ?? "medium",
  };
}

/**
 * Create/edit dialog.
 *
 * Client-side validation runs the exact same Zod schema the API route uses, so
 * the two can never disagree about what "valid" means. It exists only to save
 * a round trip -- the server validates again regardless, and any field errors
 * it returns are merged in below.
 */
export function ContactFormDialog({
  contact,
  onClose,
  onSubmit,
}: {
  contact: Contact | null;
  onClose: () => void;
  onSubmit: (
    draft: ContactDraft,
  ) => Promise<{ ok: true } | { ok: false; error?: string; fieldErrors?: Record<string, string> }>;
}) {
  // The parent mounts this component only while the dialog is open, and gives
  // it a `key` that changes per contact. That means fresh state comes from
  // remounting rather than from an effect that syncs props into state -- which
  // is both simpler and one fewer render per open.
  const [draft, setDraft] = React.useState<ContactDraft>(() => draftFrom(contact));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const firstFieldRef = React.useRef<HTMLInputElement>(null);

  const isEdit = contact !== null;

  React.useEffect(() => {
    // Focus the first field so keyboard users land inside the dialog.
    firstFieldRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    // Stop the page behind the dialog from scrolling on mobile.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  function update(field: keyof ContactDraft, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    // Clear a field's error as soon as the user starts fixing it.
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const validation = validateContactInput(draft);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    try {
      const result = await onSubmit(draft);
      if (result.ok) {
        onClose();
      } else {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        setFormError(result.error ?? "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-form-title"
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface shadow-xl sm:max-w-lg sm:rounded-[var(--radius-card)]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-4">
          <h2 id="contact-form-title" className="text-base font-semibold text-ink">
            {isEdit ? "Edit contact" : "Add contact"}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </Button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 px-5 py-5">
          {formError && <Alert tone="danger">{formError}</Alert>}

          <Field label="Name" htmlFor="contact-name" error={errors.name} required>
            <Input
              id="contact-name"
              ref={firstFieldRef}
              value={draft.name}
              onChange={(e) => update("name", e.target.value)}
              invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "contact-name-error" : undefined}
              placeholder="Priya Raman"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" htmlFor="contact-company" error={errors.company}>
              <Input
                id="contact-company"
                value={draft.company}
                onChange={(e) => update("company", e.target.value)}
                invalid={Boolean(errors.company)}
                placeholder="Sequoia"
              />
            </Field>

            <Field label="Role" htmlFor="contact-role" error={errors.role}>
              <Input
                id="contact-role"
                value={draft.role}
                onChange={(e) => update("role", e.target.value)}
                invalid={Boolean(errors.role)}
                placeholder="Partner"
              />
            </Field>
          </div>

          <Field label="Where you met" htmlFor="contact-where" error={errors.where_met}>
            <Input
              id="contact-where"
              value={draft.where_met}
              onChange={(e) => update("where_met", e.target.value)}
              invalid={Boolean(errors.where_met)}
              placeholder="Haas energy club mixer"
            />
          </Field>

          <Field label="Priority" htmlFor="contact-priority" error={errors.priority} required>
            <Select
              id="contact-priority"
              value={draft.priority}
              onChange={(e) => update("priority", e.target.value)}
              invalid={Boolean(errors.priority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Notes" htmlFor="contact-notes" error={errors.notes}>
            <Textarea
              id="contact-notes"
              value={draft.notes}
              onChange={(e) => update("notes", e.target.value)}
              invalid={Boolean(errors.notes)}
              placeholder="What you talked about, and what to follow up on."
            />
          </Field>

          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? "Saving..." : isEdit ? "Save changes" : "Add contact"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
