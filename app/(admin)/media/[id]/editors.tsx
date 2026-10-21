"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteMedia, updateCaption, updateMedia, type ActionState } from "../actions";
import ui from "@/components/ui.module.css";
import styles from "../media.module.css";

const idle: ActionState = { status: "idle" };

function Result({ state }: { state: ActionState }) {
  if (state.status === "ok") return <span className={styles.saved}>✓ {state.message}</span>;
  if (state.status === "error")
    return (
      <span className={ui.error} role="alert">
        {state.message}
      </span>
    );
  return null;
}

export function MediaForm(props: {
  id: string;
  theme: string;
  voice: string;
  author: string;
  captionId: string | null;
  isDraft: boolean;
  isDaily: boolean;
  captions: { id: string; label: string }[];
  voices: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(updateMedia.bind(null, props.id), idle);

  return (
    <form action={action} className={styles.form}>
      <div className={styles.formRow}>
        <label className="field">
          <span>Theme</span>
          <input className="input" name="theme" defaultValue={props.theme} maxLength={120} />
        </label>
        <label className="field">
          <span>Shown as author</span>
          <input className="input" name="author" defaultValue={props.author} maxLength={60} />
        </label>
      </div>
      <div className={styles.formRow}>
        <label className="field">
          <span>Caption style</span>
          <select className="input" name="voice" defaultValue={props.voice}>
            {props.voices.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        {!props.isDaily && (
          <label className="field">
            <span>Caption shown on the photo</span>
            <select className="input" name="captionId" defaultValue={props.captionId ?? ""}>
              {!props.captionId && <option value="">None chosen yet</option>}
              {props.captions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label.length > 70 ? `${c.label.slice(0, 70)}…` : c.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {props.isDraft && (
        <label className={styles.check}>
          <input type="checkbox" name="publish" /> Publish now (it goes into Vote; this can&apos;t be undone)
        </label>
      )}
      <div className={styles.formActions}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function CaptionEditor({ captionId, mediaId, text }: { captionId: string; mediaId: string; text: string }) {
  const [state, action, pending] = useActionState(updateCaption.bind(null, captionId, mediaId), idle);
  const [value, setValue] = useState(text);
  const dirty = value.trim() !== text;

  return (
    <form action={action} className={styles.captionEdit}>
      <textarea
        className="input"
        name="text"
        rows={2}
        maxLength={280}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Caption text"
      />
      {(dirty || state.status !== "idle") && (
        <div className={styles.formActions}>
          {dirty && (
            <>
              <button type="submit" className="btn btn-sm btn-primary" disabled={pending || !value.trim()}>
                {pending ? "Saving…" : "Save caption"}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setValue(text)}>
                Undo
              </button>
            </>
          )}
          {!dirty && <Result state={state} />}
          {dirty && state.status === "error" && <Result state={state} />}
        </div>
      )}
    </form>
  );
}

export function DeleteMedia({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <div className={`${styles.formActions} ${styles.factsGap}`}>
        <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
          Delete this media…
        </button>
      </div>
    );
  }

  return (
    <div className={`${styles.formActions} ${styles.factsGap}`}>
      <button
        type="button"
        className="btn btn-danger"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            // Redirects to /media on success.
            const result = await deleteMedia(id);
            if (result?.status === "error") setError(result.message ?? "Couldn't delete.");
          })
        }
      >
        {pending ? "Deleting…" : "Yes, delete it permanently"}
      </button>
      <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </button>
      {error && (
        <span className={ui.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
