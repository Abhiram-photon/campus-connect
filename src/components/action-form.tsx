"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/lib/types";

export type CampusFormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

type Props = {
  action: CampusFormAction;
  children: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  buttonVariant?: "primary" | "default" | "quiet" | "danger";
  buttonClassName?: string;
  className?: string;
  confirmMessage?: string;
  hideFeedback?: boolean;
};

export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Working…",
  buttonVariant = "primary",
  buttonClassName = "",
  className = "",
  confirmMessage,
  hideFeedback = false,
}: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, { status: "idle", message: "" });
  const variant = {
    primary: "btn btn-primary",
    default: "btn",
    quiet: "btn btn-quiet",
    danger: "btn btn-danger",
  }[buttonVariant];

  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {children}
      <button type="submit" className={`${variant} ${buttonClassName}`} disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </button>
      {!hideFeedback && state.message ? (
        <p className={`form-feedback ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
