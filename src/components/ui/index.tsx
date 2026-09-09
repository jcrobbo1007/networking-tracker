import * as React from "react";

/**
 * A small component system.
 *
 * Every primitive here is styled purely from the semantic tokens defined in
 * globals.css, so the dark theme and any future rebrand are a token change
 * rather than a sweep through JSX. Each accepts `className` so callers can
 * adjust layout without forking the component.
 */

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] " +
  "font-medium whitespace-nowrap transition-colors " +
  "disabled:pointer-events-none disabled:opacity-50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  secondary:
    "bg-surface text-ink border border-border hover:bg-surface-muted hover:border-border-strong",
  ghost: "text-ink-muted hover:bg-surface-muted hover:text-ink",
  danger:
    "bg-surface text-danger border border-danger-border hover:bg-danger-soft",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  // 44px min touch target on mobile; tightens up on larger screens.
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-sm sm:min-h-10",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: React.ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-block size-4 shrink-0 rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      style={{ animation: "spin-slow 0.7s linear infinite" }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Form fields                                                                */
/* -------------------------------------------------------------------------- */

const CONTROL_BASE =
  "w-full rounded-[var(--radius-control)] border bg-surface px-3 py-2.5 text-base " +
  "text-ink placeholder:text-ink-subtle transition-colors sm:text-sm " +
  "disabled:cursor-not-allowed disabled:opacity-60";

// 16px base font size on mobile stops iOS Safari zooming on focus; sm:text-sm
// brings it back down on larger screens.

function controlClasses(invalid?: boolean, className?: string) {
  return cx(
    CONTROL_BASE,
    invalid ? "border-danger-border" : "border-border hover:border-border-strong",
    className,
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        // role="alert" so screen readers announce it the moment it appears.
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  invalid,
  className,
  ...props
}: React.ComponentPropsWithRef<"input"> & { invalid?: boolean }) {
  return (
    <input
      className={controlClasses(invalid, className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Textarea({
  invalid,
  className,
  ...props
}: React.ComponentPropsWithRef<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      className={controlClasses(invalid, cx("min-h-24 resize-y", className))}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Select({
  invalid,
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<"select"> & { invalid?: boolean }) {
  return (
    <select
      className={controlClasses(invalid, cx("appearance-none pr-9", className))}
      aria-invalid={invalid || undefined}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.19l3.71-3.96a.75.75 0 111.08 1.04l-4.25 4.53a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.6rem center",
        backgroundSize: "1.15rem",
      }}
      {...props}
    >
      {children}
    </select>
  );
}

/* -------------------------------------------------------------------------- */
/* Surfaces and feedback                                                      */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-[var(--radius-card)] border border-border bg-surface",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Alert({
  tone = "danger",
  title,
  children,
  onDismiss,
}: {
  tone?: "danger" | "success";
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const tones = {
    danger: "bg-danger-soft border-danger-border text-danger",
    success: "bg-success-soft border-success-border text-success",
  };
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-3 rounded-[var(--radius-control)] border px-4 py-3 text-sm",
        tones[tone],
      )}
    >
      <div className="flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-1 shrink-0 rounded p-1 opacity-70 hover:opacity-100"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    high: "bg-priority-high-soft text-priority-high border-priority-high-border",
    medium:
      "bg-priority-medium-soft text-priority-medium border-priority-medium-border",
    low: "bg-priority-low-soft text-priority-low border-priority-low-border",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        styles[priority] ?? styles.low,
      )}
    >
      {priority}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-surface-muted text-ink-subtle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm text-ink-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** Skeleton rows, so the loading state has the shape of the real content. */
export function ContactsSkeleton() {
  return (
    <div className="divide-y divide-border" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4 sm:px-6">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 rounded bg-surface-muted" />
            <div className="h-3 w-56 rounded bg-surface-muted" />
          </div>
          <div className="h-5 w-14 rounded-full bg-surface-muted" />
        </div>
      ))}
    </div>
  );
}
