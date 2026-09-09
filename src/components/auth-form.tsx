"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { auth } from "@/lib/neon-client";
import { Alert, Button, Field, Input } from "@/components/ui";

type Mode = "sign-in" | "sign-up";

const COPY = {
  "sign-in": {
    heading: "Welcome back",
    sub: "Sign in to see your contacts.",
    submit: "Sign in",
    switchPrompt: "Need an account?",
    switchCta: "Create one",
    switchHref: "/sign-up",
  },
  "sign-up": {
    heading: "Create your account",
    sub: "Start tracking the people you meet at Berkeley.",
    submit: "Create account",
    switchPrompt: "Already have an account?",
    switchCta: "Sign in",
    switchHref: "/sign-in",
  },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const copy = COPY[mode];

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  function validate() {
    const errors: Record<string, string> = {};
    if (mode === "sign-up" && name.trim().length === 0) {
      errors.name = "Name is required";
    }
    if (email.trim().length === 0) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Enter a valid email address";
    }
    if (password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }
    return errors;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const result =
        mode === "sign-up"
          ? await auth.signUp.email({
              email: email.trim(),
              password,
              name: name.trim(),
            })
          : await auth.signIn.email({ email: email.trim(), password });

      if (result?.error) {
        setError(
          result.error.message ??
            (mode === "sign-in"
              ? "That email and password did not match."
              : "Could not create your account."),
        );
        return;
      }

      router.push("/contacts");
      router.refresh();
    } catch (cause) {
      console.error(cause);
      setError(
        "Could not reach the authentication service. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-5 py-12 sm:py-20">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {copy.heading}
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">{copy.sub}</p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {mode === "sign-up" && (
          <Field label="Name" htmlFor="name" error={fieldErrors.name} required>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "name-error" : undefined}
            />
          </Field>
        )}

        <Field label="Email" htmlFor="email" error={fieldErrors.email} required>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={fieldErrors.password}
          hint={mode === "sign-up" ? "At least 8 characters." : undefined}
          required
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
          />
        </Field>

        <Button type="submit" loading={submitting} className="mt-1 w-full">
          {submitting ? "Working..." : copy.submit}
        </Button>
      </form>

      <p className="text-center text-sm text-ink-muted">
        {copy.switchPrompt}{" "}
        <Link
          href={copy.switchHref}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          {copy.switchCta}
        </Link>
      </p>
    </div>
  );
}
