"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { deleteImage, registerImage, updateImage, type ImageResult } from "./actions";
import ui from "@/components/ui.module.css";
import styles from "./images.module.css";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 6 * 1024 * 1024;

/** Uploads straight to Supabase Storage (the admin's own folder), then records it in the library. */
export function ImageUploader({ userId }: { userId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<ImageResult | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function choose(f: File | undefined) {
    setResult(null);
    if (!f) return;
    if (!TYPES[f.type]) return setResult({ ok: false, message: "Use a JPEG, PNG, or WebP image." });
    if (f.size > MAX_BYTES) return setResult({ ok: false, message: "Keep it under 6 MB." });
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function upload() {
    if (!file) return;
    startTransition(async () => {
      const path = `${userId}/library-${crypto.randomUUID()}.${TYPES[file.type]}`;
      const { error } = await createClient().storage.from("caption-photos").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) return setResult({ ok: false, message: `Upload failed: ${error.message}` });
      const r = await registerImage(path, description);
      setResult(r);
      if (r.ok) {
        setFile(null);
        setPreview(null);
        setDescription("");
      }
    });
  }

  return (
    <section className={`${ui.card} ${styles.uploader}`}>
      <div className={ui.cardHead}>
        <div>
          <h2 className={ui.cardTitle}>Upload an image</h2>
          <p className={ui.cardSub}>JPEG, PNG, or WebP up to 6 MB. Stored in Supabase Storage and ready to caption.</p>
        </div>
      </div>
      <div className={styles.uploadRow}>
        <button
          type="button"
          className={styles.drop}
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            choose(e.dataTransfer.files[0]);
          }}
          disabled={pending}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Selected file" />
          ) : (
            <span>
              <strong>Choose a file</strong>
              <br />
              or drop it here
            </span>
          )}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className={styles.uploadFields}>
          <label className="field">
            <span>Description (optional)</span>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              placeholder="e.g. Pigeon on the Low Steps"
            />
          </label>
          <div className={styles.actionsRow}>
            <button type="button" className="btn btn-sun" disabled={!file || pending} onClick={upload}>
              {pending ? "Uploading…" : "Upload"}
            </button>
            {file && !pending && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                }}
              >
                Clear
              </button>
            )}
          </div>
          {result && (
            <p className={result.ok ? styles.ok : ui.error} role="status">
              {result.ok ? `✓ ${result.message}` : result.message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Edit the description, use the image for new media, or delete it. */
export function ImageActions({
  id,
  description,
  usedBy,
}: {
  id: string;
  description: string;
  usedBy: number;
}) {
  const [mode, setMode] = useState<"idle" | "edit" | "delete">("idle");
  const [value, setValue] = useState(description);
  const [result, setResult] = useState<ImageResult | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<ImageResult>) =>
    startTransition(async () => {
      const r = await work();
      setResult(r);
      if (r.ok) setMode("idle");
    });

  return (
    <div className={styles.cardActions}>
      {mode === "edit" ? (
        <div className={styles.editRow}>
          <input
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={300}
            aria-label="Image description"
            autoFocus
          />
          <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => run(() => updateImage(id, value))}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setMode("idle")} disabled={pending}>
            Cancel
          </button>
        </div>
      ) : mode === "delete" ? (
        <div className={styles.editRow}>
          <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => run(() => deleteImage(id))}>
            {pending ? "Deleting…" : "Delete file"}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setMode("idle")} disabled={pending}>
            Keep
          </button>
        </div>
      ) : (
        <div className={styles.editRow}>
          <Link href={`/media/new?image=${id}`} className="btn btn-sm">
            Caption it
          </Link>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setValue(description);
              setResult(null);
              setMode("edit");
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className={`btn btn-sm ${styles.ghostDanger}`}
            onClick={() => {
              setResult(null);
              setMode("delete");
            }}
            disabled={usedBy > 0}
            title={usedBy > 0 ? "Posts still use this image" : undefined}
          >
            Delete
          </button>
        </div>
      )}
      {result && !result.ok && (
        <p className={ui.error} role="alert">
          {result.message}
        </p>
      )}
    </div>
  );
}
