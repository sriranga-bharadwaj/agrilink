"use client";

import { useActionState, type ReactNode } from "react";

export type ActionResult = { error?: string; ok?: string } | null;
type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

// Form bound to a server action; shows the action's error/success message.
export function ActionForm({
  action,
  children,
  submitLabel,
  submitClassName = "btn",
  className,
  inline = false,
}: {
  action: Action;
  children?: ReactNode;
  submitLabel: string;
  submitClassName?: string;
  className?: string;
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className={className}>
      <div className={inline ? "flex flex-wrap items-center gap-2" : "space-y-4"}>
        {children}
        <button type="submit" className={submitClassName} disabled={pending}>
          {pending ? "Working…" : submitLabel}
        </button>
      </div>
      {state?.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm text-brand-700">{state.ok}</p>}
    </form>
  );
}
