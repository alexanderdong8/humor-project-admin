"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { deleteRecord, saveRecord, type CrudState } from "@/app/(admin)/crud-actions";
import type { EntityKey, FieldSpec } from "@/lib/entities";
import ui from "./ui.module.css";
import styles from "./crud.module.css";

export type CrudColumn = {
  key: string;
  label: string;
  /** "flag" renders a boolean cell ("true"/"false") as a labeled pill. */
  kind?: "text" | "long" | "mono" | "muted" | "flag";
  on?: string;
  off?: string;
  hideNarrow?: boolean;
};

export type CrudRow = {
  id: string;
  /** Current values, used to fill the edit form. */
  values: Record<string, string | number | boolean | null>;
  /** What each column shows. */
  cells: Record<string, string>;
};

type Props = {
  entity: EntityKey;
  singular: string;
  plural: string;
  fields: FieldSpec[];
  columns: CrudColumn[];
  rows: CrudRow[];
  emptyText: string;
};

const idle: CrudState = { status: "idle" };

/** A list with add, edit, and delete for one entity (see lib/entities.ts). */
export function CrudManager({ entity, singular, plural, fields, columns, rows, emptyText }: Props) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const done = (message?: string) => {
    setAdding(false);
    setEditing(null);
    setFlash(message ?? null);
  };

  return (
    <section className={ui.card}>
      <div className={ui.cardHead}>
        <div>
          <h2 className={ui.cardTitle}>
            {rows.length} {rows.length === 1 ? singular : plural}
          </h2>
          {flash && (
            <p className={styles.flash} role="status">
              ✓ {flash}
            </p>
          )}
        </div>
        {!adding && (
          <button
            type="button"
            className="btn btn-sun"
            onClick={() => {
              setAdding(true);
              setEditing(null);
              setFlash(null);
            }}
          >
            + Add {singular}
          </button>
        )}
      </div>

      {adding && (
        <div className={styles.addBox}>
          <RecordForm entity={entity} id={null} fields={fields} singular={singular} onDone={done} />
        </div>
      )}

      {rows.length === 0 ? (
        <div className={ui.empty}>{emptyText}</div>
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={c.hideNarrow ? ui.hideNarrow : undefined}>
                    {c.label}
                  </th>
                ))}
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) =>
                editing === row.id ? (
                  <tr key={row.id}>
                    <td colSpan={columns.length + 1} className={styles.editCell}>
                      <RecordForm
                        entity={entity}
                        id={row.id}
                        fields={fields}
                        values={row.values}
                        singular={singular}
                        onDone={done}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={row.id}>
                    {columns.map((c) => (
                      <td key={c.key} className={cellClass(c)}>
                        {c.kind === "flag" ? (
                          row.cells[c.key] === "true" ? (
                            <span className="pill pill-good">● {c.on ?? "On"}</span>
                          ) : (
                            <span className="pill">○ {c.off ?? "Off"}</span>
                          )
                        ) : (
                          row.cells[c.key] || <span className={ui.muted}>—</span>
                        )}
                      </td>
                    ))}
                    <td className={styles.actions}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          setEditing(row.id);
                          setAdding(false);
                          setFlash(null);
                        }}
                      >
                        Edit
                      </button>
                      <DeleteButton entity={entity} id={row.id} singular={singular} onDone={done} />
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function cellClass(c: CrudColumn) {
  const classes = [c.hideNarrow ? ui.hideNarrow : ""];
  if (c.kind === "long") classes.push(styles.long);
  if (c.kind === "mono") classes.push("mono", styles.monoCell);
  if (c.kind === "muted") classes.push(ui.muted);
  if (c.kind === "flag") classes.push(ui.nowrap);
  return classes.filter(Boolean).join(" ") || undefined;
}

function RecordForm({
  entity,
  id,
  fields,
  values,
  singular,
  onDone,
}: {
  entity: EntityKey;
  id: string | null;
  fields: FieldSpec[];
  values?: CrudRow["values"];
  singular: string;
  onDone: (message?: string) => void;
}) {
  const [state, action, pending] = useActionState(saveRecord.bind(null, entity, id), idle);

  useEffect(() => {
    if (state.status === "ok") onDone(state.message);
    // Only react to a new result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);

  return (
    <form action={action} className={styles.form}>
      <div className={styles.fields}>
        {fields.map((f) => {
          const current = values?.[f.name] ?? f.defaultValue ?? "";
          if (f.type === "checkbox") {
            return (
              <label key={f.name} className={styles.check}>
                <input type="checkbox" name={f.name} defaultChecked={values ? Boolean(values[f.name]) : Boolean(f.defaultValue)} />
                {f.label}
              </label>
            );
          }
          return (
            <label key={f.name} className={`field ${f.wide || f.type === "textarea" ? styles.wide : ""}`}>
              <span>
                {f.label}
                {!f.required && <em className={styles.optional}> (optional)</em>}
              </span>
              {f.type === "textarea" ? (
                <textarea
                  className="input"
                  name={f.name}
                  defaultValue={String(current)}
                  maxLength={f.max}
                  required={f.required}
                  placeholder={f.placeholder}
                  rows={2}
                />
              ) : f.type === "select" ? (
                <select className="input" name={f.name} defaultValue={String(current)} required={f.required}>
                  {!f.required && <option value="">Every style</option>}
                  {f.required && !current && <option value="">Choose…</option>}
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={`input ${["envvar", "slug", "modelId", "domain", "email", "url"].includes(f.type) ? "mono" : ""}`}
                  name={f.name}
                  type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
                  defaultValue={String(current)}
                  maxLength={f.type === "number" ? undefined : f.max}
                  min={f.min}
                  max={f.type === "number" ? f.max : undefined}
                  step={f.step}
                  required={f.required}
                  placeholder={f.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
              {f.help && <small className={styles.help}>{f.help}</small>}
            </label>
          );
        })}
      </div>
      {state.status === "error" && (
        <p className={ui.error} role="alert">
          {state.message}
        </p>
      )}
      <div className={styles.formActions}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : id ? "Save changes" : `Add ${singular}`}
        </button>
        <button type="button" className="btn" onClick={() => onDone()} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteButton({
  entity,
  id,
  singular,
  onDone,
}: {
  entity: EntityKey;
  id: string;
  singular: string;
  onDone: (message?: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" className={`btn btn-sm ${styles.ghostDanger}`} onClick={() => setConfirming(true)}>
        Delete
      </button>
    );
  }
  return (
    <span className={styles.confirm}>
      <button
        type="button"
        className="btn btn-sm btn-danger"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteRecord(entity, id);
            if (result.status === "ok") onDone(`Deleted the ${singular}.`);
            else setError(result.message ?? "Couldn't delete.");
          })
        }
      >
        {pending ? "Deleting…" : `Delete ${singular}`}
      </button>
      <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)} disabled={pending}>
        Keep
      </button>
      {error && (
        <span className={ui.error} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
