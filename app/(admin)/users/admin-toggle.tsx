"use client";

import { useState, useTransition } from "react";
import { setSuperadmin } from "./actions";
import ui from "@/components/ui.module.css";

type Props = { userId: string; name: string; isAdmin: boolean; isSelf: boolean; compact?: boolean };

/** Promote to / remove from superadmin, with a confirm step. */
export function AdminToggle({ userId, name, isAdmin, isSelf, compact = false }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (isSelf) {
    return compact ? null : <p className={ui.muted}>This is you. Another superadmin can remove your access.</p>;
  }

  const size = compact ? "btn btn-sm" : "btn";
  if (!confirming) {
    return (
      <button type="button" className={`${size} ${isAdmin ? "btn-danger" : ""}`} onClick={() => setConfirming(true)}>
        {isAdmin ? "Remove admin" : "Make admin"}
      </button>
    );
  }

  return (
    <span className={ui.confirm}>
      {!compact && (
        <span>
          {isAdmin
            ? `Remove ${name}'s superadmin access? They'll be locked out of Backstage.`
            : `Make ${name} a superadmin? They'll be able to see every member and vote, and create, edit, and delete media.`}
        </span>
      )}
      <button
        type="button"
        className={`${size} ${isAdmin ? "btn-danger" : "btn-primary"}`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setSuperadmin(userId, !isAdmin);
            if (result.ok) {
              setConfirming(false);
              setError(null);
            } else setError(result.message ?? "Couldn't save.");
          })
        }
      >
        {pending ? "Saving…" : isAdmin ? "Yes, remove" : "Yes, make admin"}
      </button>
      <button type="button" className={size} onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </button>
      {error && (
        <span className={ui.error} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
